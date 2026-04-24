import { Router, Request, Response } from 'express';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { getInvestigationAgent } from '../services/agents';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate  —  SSE stream of the deep agent graph running.
//
// Body: { drug: string, scenarioParams?: string }
//
// SSE events (all carry `source`: "main" | "sub"):
//   event: start          { drug }
//   event: step           { source, node }           graph node just ran
//   event: token          { source, text }            LLM token (native streaming)
//   event: tool_call      { source, name, args }      agent invoking a tool
//   event: tool_result    { source, name, preview }   tool output @120 chars
//   event: agent_response { source, preview }         agent text reply @200 chars
//   event: graph_data     { drug, graph }             force-graph JSON payload
//   event: done           { durationMs }
//   event: error          { message }
//
// Implementation: uses agent.stream() with streamMode:["updates","messages"]
// and subgraphs:true. This is a 3-TUPLE [namespace, mode, data] per chunk.
// Single mode + subgraphs would be 2-tuple — keep the array to get 3-tuple.
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PREVIEW = 120;
const AGENT_PREVIEW = 200;

interface InvestigateBody {
  drug?: string;
  scenarioParams?: string;
}

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function cap(v: unknown, n: number): string {
  const s =
    v == null
      ? ''
      : typeof v === 'string'
        ? v
        : (() => {
            try {
              return JSON.stringify(v);
            } catch {
              return String(v);
            }
          })();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Determine source label from namespace: empty = main agent, contains tools: = subagent. */
function source(namespace: string[]): string {
  return namespace.length === 0 ? 'main' : 'sub';
}

/** Unwrap TUB/prompt-based JSON wrapper {"type":"final","content":"..."}.
 *  Also works for native-tool models that return plain text. */
function extractText(content: unknown): string {
  let raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((p) =>
              typeof p === 'string'
                ? p
                : p && typeof p === 'object' && 'text' in p
                  ? String((p as { text: unknown }).text)
                  : '',
            )
            .join('')
        : content != null
          ? (() => {
              try {
                return JSON.stringify(content);
              } catch {
                return '';
              }
            })()
          : '';
  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      if (p.type === 'final' && typeof p.content === 'string') return p.content;
      if (p.type === 'tool_call') return ''; // handled by tool_call event
    }
  } catch {
    /* plain text */
  }
  return raw;
}

function buildPrompt(drug: string, scenarioParams?: string): string {
  let p = `Investigate the drug shortage situation for: ${drug}.\n\n`;
  p +=
    'Follow the full investigation process: resolve the drug, find root causes ranked with ' +
    'evidence and source URLs, delegate risk propagation and mitigation planning to the ' +
    'appropriate subagents, and produce a final structured report.';
  if (scenarioParams) {
    p += `\n\nAlso address this what-if scenario using the scenario_analyst subagent: ${scenarioParams}`;
  }
  return p;
}

router.post('/', async (req: Request, res: Response) => {
  const { drug, scenarioParams } = (req.body ?? {}) as InvestigateBody;

  if (!drug || typeof drug !== 'string' || !drug.trim()) {
    res.status(400).json({ error: 'Body must include { drug: string }' });
    return;
  }

  // SSE headers + disable Nagle so small writes flush to client immediately.
  // Without setNoDelay, Node's HTTP response buffers small chunks (< ~16KB)
  // which can stall SSE streams until a later larger write arrives.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  try { (res.socket as { setNoDelay?: (b: boolean) => void } | null)?.setNoDelay?.(true); } catch { /* noop */ }

  const started = Date.now();
  let closed = false;
  req.on('close', () => { closed = true; });

  sse(res, 'start', { drug });

  // Keepalive comment every 10s so the client knows the connection is alive
  // even during long LLM calls. SSE clients ignore comment lines (":...").
  const heartbeat = setInterval(() => {
    if (closed) return;
    try { res.write(': keepalive\n\n'); } catch { /* noop */ }
  }, 10_000);

  let agent;
  try {
    agent = getInvestigationAgent();
  } catch (err) {
    sse(res, 'error', { message: (err as Error).message });
    res.end();
    return;
  }

  try {
    // streamMode array → 3-tuple [namespace, mode, data] per chunk.
    // subgraphs:true surfaces events from subagent subgraphs with non-empty namespace.
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: buildPrompt(drug.trim(), scenarioParams?.trim()) }] },
      { streamMode: ['updates', 'messages'], subgraphs: true, recursionLimit: 60 },
    );

    for await (const chunk of stream) {
      if (closed) break;

      // Destructure the 3-tuple: [namespace, mode, data]
      const [ns, mode, data] = chunk as [string[], string, unknown];
      const src = source(ns);

      if (mode === 'messages') {
        const [msg] = data as [unknown, unknown];

        if (msg instanceof AIMessageChunk) {
          // Tool call chunks (model deciding to call a tool — streams the call)
          const tcc = msg.tool_call_chunks ?? [];
          for (const tc of tcc) {
            if (tc.name) {
              let args: unknown = tc.args;
              try { args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args; } catch { /* raw */ }
              sse(res, 'tool_call', { source: src, name: tc.name, args });
            }
          }

          // Plain assistant text token — skip if it was a tool call turn
          if (!tcc.length) {
            const text = extractText(msg.content);
            if (text) sse(res, 'token', { source: src, text });
          }
        } else if (msg instanceof ToolMessage) {
          // Side-channel: supply chain graph data for UI panel
          if (msg.name === 'getSupplyChainGraph') {
            let payload: Record<string, unknown> | null = null;
            try {
              payload = typeof msg.content === 'string'
                ? JSON.parse(msg.content)
                : (msg.content as unknown as Record<string, unknown>);
            } catch { payload = null; }
            const graph = payload?.graph;
            if (graph && typeof graph === 'object') {
              sse(res, 'graph_data', { drug: (payload as { drug?: string }).drug ?? drug, graph });
            }
          }
          sse(res, 'tool_result', { source: src, name: msg.name, preview: cap(msg.content, TOOL_PREVIEW) });
        }
      } else if (mode === 'updates') {
        // data is { [nodeName]: nodeOutput }
        const updates = data as Record<string, unknown>;
        for (const [nodeName, nodeOutput] of Object.entries(updates)) {
          // Emit step event so UI can see which node just ran
          sse(res, 'step', { source: src, node: nodeName });

          // Extract agent's text response from model nodes
          if (nodeName === 'model_request' || nodeName === 'agent') {
            const msgs =
              (nodeOutput as { messages?: unknown[] })?.messages ??
              (Array.isArray(nodeOutput) ? (nodeOutput as unknown[]) : []);
            for (const m of msgs) {
              if (m && typeof m === 'object') {
                const text = extractText((m as { content?: unknown }).content);
                if (text.trim()) {
                  sse(res, 'agent_response', { source: src, preview: cap(text, AGENT_PREVIEW) });
                }
              }
            }
          }
        }
      }
    }

    if (!closed) sse(res, 'done', { durationMs: Date.now() - started });
  } catch (err) {
    console.error('[investigate] error:', (err as Error).message);
    if (!closed) sse(res, 'error', { message: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

export default router;

// trigger 1777063504
