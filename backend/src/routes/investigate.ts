import { Router, Request, Response } from 'express';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import { buildFreshAgent, getInvestigationAgent } from '../services/agents';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate  —  SSE stream of the deep agent graph.
//
// Uses agent.streamEvents (v2) with subgraphs:true.
// Events:
//   event: start          { drug }
//   event: step           { source, node }
//   event: token          { source, text }
//   event: tool_call      { source, name, args }
//   event: tool_result    { source, name, preview }
//   event: agent_response { source, preview }
//   event: graph_data     { drug, graph }
//   event: done           { durationMs }
//   event: error          { message }
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PREVIEW = 120;
const AGENT_PREVIEW = 200;

interface InvestigateBody {
  drug?: string;
  scenarioParams?: string;
}

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function cap(v: unknown, n: number): string {
  const s = v == null ? '' : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function extractText(content: unknown): string {
  let raw = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map((p) => typeof p === 'string' ? p : (p && typeof p === 'object' && 'text' in p ? String((p as {text:unknown}).text) : '')).join('')
    : content != null ? (() => { try { return JSON.stringify(content); } catch { return ''; } })() : '';
  raw = raw.trim();
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const p = JSON.parse(raw);
    if (p?.type === 'final' && typeof p.content === 'string') return p.content;
    if (p?.type === 'tool_call') return '';
  } catch { /* plain text */ }
  return raw;
}

function buildPrompt(drug: string, scenarioParams?: string): string {
  let p = `Investigate the drug shortage situation for: ${drug}.\n\nFollow the full investigation process: resolve the drug, find root causes ranked with evidence and source URLs, delegate risk propagation and mitigation planning to the appropriate subagents, and produce a final structured report.`;
  if (scenarioParams) p += `\n\nAlso address this what-if: ${scenarioParams}`;
  return p;
}

router.post('/', async (req: Request, res: Response) => {
  const { drug, scenarioParams } = (req.body ?? {}) as InvestigateBody;

  if (!drug || typeof drug !== 'string' || !drug.trim()) {
    res.status(400).json({ error: 'Body must include { drug: string }' });
    return;
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  try { (res.socket as unknown as { setNoDelay?: (b: boolean) => void } | null)?.setNoDelay?.(true); } catch { /* noop */ }

  const started = Date.now();
  let closed = false;
  req.on('close', () => { closed = true; });

  sse(res, 'start', { drug });

  // Keepalive so long LLM calls don't look like a dead connection
  const heartbeat = setInterval(() => {
    if (!closed) try { res.write(': keepalive\n\n'); } catch { /* noop */ }
  }, 10_000);

  let agent;
  try {
    // Using fresh agent per request to rule out singleton state issues.
    // Swap to getInvestigationAgent() once stable.
    agent = getInvestigationAgent.length === 0 ? buildFreshAgent() : getInvestigationAgent();
  } catch (err) {
    clearInterval(heartbeat);
    sse(res, 'error', { message: (err as Error).message });
    res.end();
    return;
  }

  try {
    // Log every event to file for debugging
    const debugFs = require('fs') as typeof import('fs');
    debugFs.writeFileSync('/tmp/investigate-debug.log', `=== ${new Date().toISOString()} start ===\n`);
    const dbg = (m: string) => debugFs.appendFileSync('/tmp/investigate-debug.log', new Date().toISOString() + ' ' + m + '\n');

    dbg('calling streamEvents');
    const eventStream = agent.streamEvents(
      { messages: [{ role: 'user', content: buildPrompt(drug.trim(), scenarioParams?.trim()) }] },
      { version: 'v2', recursionLimit: 60 } as Record<string, unknown>,
    ) as AsyncIterable<StreamEvent>;
    dbg('streamEvents returned, entering for-await');

    let evCount = 0;
    for await (const ev of eventStream) {
      evCount++;
      if (evCount <= 10) dbg(`ev #${evCount} kind=${ev.event} name=${ev.name}`);
      if (closed) break;

      const kind = ev.event;
      // Determine source: events from subgraph namespaces have tags with langgraph_checkpoint_ns
      const ns = (ev.metadata?.langgraph_checkpoint_ns as string | undefined) ?? '';
      const source = ns.includes('tools:') ? 'sub' : 'main';

      if (kind === 'on_chat_model_stream') {
        const chunk = ev.data?.chunk;
        if (chunk instanceof AIMessageChunk) {
          const tcc = chunk.tool_call_chunks ?? [];
          for (const tc of tcc) {
            if (tc.name) {
              let args: unknown = tc.args;
              try { args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args; } catch { /* raw */ }
              sse(res, 'tool_call', { source, name: tc.name, args });
            }
          }
          if (!tcc.length) {
            const text = extractText(chunk.content);
            if (text) sse(res, 'token', { source, text });
          }
        }
        continue;
      }

      if (kind === 'on_tool_start') {
        sse(res, 'tool_call', { source, name: ev.name, args: ev.data?.input ?? {} });
        continue;
      }

      if (kind === 'on_tool_end') {
        const output = ev.data?.output;
        // Side-channel: supply-chain graph for UI panel
        if (ev.name === 'getSupplyChainGraph' && output) {
          let payload: Record<string,unknown> | null = null;
          try { payload = typeof output === 'string' ? JSON.parse(output) : output as Record<string,unknown>; } catch { payload = null; }
          const graph = payload?.graph;
          if (graph && typeof graph === 'object') sse(res, 'graph_data', { drug: (payload as {drug?:string}).drug ?? drug, graph });
        }
        sse(res, 'tool_result', { source, name: ev.name, preview: cap(ev.data?.output, TOOL_PREVIEW) });
        continue;
      }

      // Subagent lifecycle via chain start/end
      if (kind === 'on_chain_start' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name ?? '')) {
        sse(res, 'step', { source: 'sub', node: ev.name, status: 'started' });
        continue;
      }
      if (kind === 'on_chain_end' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name ?? '')) {
        sse(res, 'step', { source: 'sub', node: ev.name, status: 'done' });
        continue;
      }

      // Final assistant message from model nodes
      if (kind === 'on_chain_end') {
        const msgs = (ev.data?.output as { messages?: unknown[] })?.messages ?? [];
        const last = msgs[msgs.length - 1];
        if (last && typeof last === 'object') {
          const text = extractText((last as { content?: unknown }).content);
          if (text.trim()) sse(res, 'agent_response', { source, preview: cap(text, AGENT_PREVIEW) });
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
