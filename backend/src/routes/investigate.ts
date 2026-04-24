import { Router, Request, Response } from 'express';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { getInvestigationAgent } from '../services/agents';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate  —  SSE stream of the agent graph running.
//
// Body: { drug: string, scenarioParams?: string }
//
// Events (all carry a `source`: "main" | "sub:<pregel_id>"):
//   event: start           { drug }
//   event: step            { source, node }                graph step just ran
//   event: token           { source, text }                streamed LLM tokens (verbose)
//   event: tool_call       { source, name, args }          agent calling a tool
//   event: tool_result     { source, name, preview }       tool output, capped @120
//   event: agent_response  { source, preview }             agent's assistant text, capped @200
//   event: graph_data      { drug, graph }                 supply-chain graph payload
//   event: done            { durationMs }
//   event: error           { message }
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PREVIEW_CHARS = 120;
const AGENT_PREVIEW_CHARS = 200;

interface InvestigateBody {
  drug?: string;
  scenarioParams?: string;
}

function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildPrompt(drug: string, scenarioParams?: string): string {
  let prompt = `Investigate the drug shortage situation for: ${drug}.\n\n`;
  prompt +=
    'Follow the full investigation process: resolve the drug, find root causes (ranked with ' +
    'evidence and source URLs), delegate risk propagation and mitigation planning to the ' +
    'appropriate subagents, and produce a final structured report.';
  if (scenarioParams) {
    prompt += `\n\nAlso address this what-if scenario using the scenario_analyst subagent: ${scenarioParams}`;
  }
  return prompt;
}

/** Identify the source agent from the stream namespace.
 *  Empty namespace → main; "tools:<id>" → subagent invocation. */
function sourceFromNamespace(namespace: string[]): string {
  if (namespace.length === 0) return 'main';
  const sub = namespace.find((s) => s.startsWith('tools:'));
  return sub ? `sub:${sub.split(':')[1]?.slice(0, 8) ?? 'unknown'}` : 'sub';
}

function preview(v: unknown, cap: number): string {
  let s: string;
  if (v == null) s = '';
  else if (typeof v === 'string') s = v;
  else {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  }
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}

/** Extract the user-visible text from an agent's response.
 *  TUB models wrap tool_calls and final answers in JSON — unwrap {type:"final",content}. */
function extractAgentText(content: unknown): string {
  let raw = '';
  if (typeof content === 'string') raw = content;
  else if (Array.isArray(content)) {
    raw = content
      .map((p) =>
        typeof p === 'string'
          ? p
          : p && typeof p === 'object' && 'text' in p
            ? String((p as { text: unknown }).text)
            : '',
      )
      .join('');
  } else if (content != null) {
    try {
      raw = JSON.stringify(content);
    } catch {
      raw = String(content);
    }
  }
  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.type === 'final' && typeof parsed.content === 'string') {
        return parsed.content;
      }
      if (parsed.type === 'tool_call') {
        // Suppress tool_call JSON in agent_response; tool_call event is emitted separately.
        return '';
      }
    }
  } catch {
    /* not JSON — use raw */
  }
  return raw;
}

router.post('/', async (req: Request, res: Response) => {
  const { drug, scenarioParams } = (req.body ?? {}) as InvestigateBody;

  if (!drug || typeof drug !== 'string' || !drug.trim()) {
    res.status(400).json({ error: 'Body must include { drug: string }' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const started = Date.now();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
  });

  writeEvent(res, 'start', { drug });

  let agent;
  try {
    agent = getInvestigationAgent();
  } catch (err) {
    writeEvent(res, 'error', { message: (err as Error).message });
    res.end();
    return;
  }

  const prompt = buildPrompt(drug.trim(), scenarioParams?.trim());

  try {
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: prompt }] },
      {
        streamMode: ['updates', 'messages'],
        subgraphs: true,
        recursionLimit: 50,
      },
    );

    for await (const event of stream) {
      if (clientClosed) break;

      // With streamMode: [...] + subgraphs:true, each event is [namespace, mode, data]
      const [namespace, mode, data] = event as [string[], string, unknown];
      const source = sourceFromNamespace(namespace);

      if (mode === 'messages') {
        // data is [message, metadata]
        const [msg] = data as [unknown, unknown];

        if (msg instanceof AIMessageChunk) {
          // Tool call chunks (partial tool invocations mid-stream)
          const tcChunks = msg.tool_call_chunks ?? [];
          for (const tc of tcChunks) {
            if (tc.name) {
              let parsedArgs: unknown = tc.args;
              try {
                parsedArgs = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
              } catch {
                /* keep raw */
              }
              writeEvent(res, 'tool_call', {
                source,
                name: tc.name,
                args: parsedArgs,
              });
            }
          }

          // Plain assistant text content
          const text =
            typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .map((p) =>
                      typeof p === 'string'
                        ? p
                        : p && typeof p === 'object' && 'text' in p
                          ? String((p as { text: unknown }).text)
                          : '',
                    )
                    .join('')
                : '';
          if (text && tcChunks.length === 0) {
            writeEvent(res, 'token', { source, text });
          }
        } else if (msg instanceof ToolMessage) {
          // Capture graph_data side-channel for getSupplyChainGraph
          if (msg.name === 'getSupplyChainGraph') {
            const raw = msg.content;
            let payload: Record<string, unknown> | null = null;
            try {
              payload = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as Record<string, unknown>);
            } catch {
              payload = null;
            }
            const graph = payload?.graph;
            if (graph && typeof graph === 'object') {
              writeEvent(res, 'graph_data', {
                drug: (payload as { drug?: string }).drug ?? drug,
                graph,
              });
            }
          }
          writeEvent(res, 'tool_result', {
            source,
            name: msg.name,
            preview: preview(msg.content, TOOL_PREVIEW_CHARS),
          });
        }
      } else if (mode === 'updates') {
        // data is { [nodeName]: nodeOutput } — the graph step that just ran
        const updates = data as Record<string, unknown>;
        for (const [nodeName, nodeOutput] of Object.entries(updates)) {
          writeEvent(res, 'step', { source, node: nodeName });

          // Extract assistant text from model nodes — capped at AGENT_PREVIEW_CHARS.
          // Tool nodes emit ToolMessages which go through the 'messages' stream path.
          if (nodeName === 'model_request' || nodeName === 'agent') {
            const msgs =
              (nodeOutput as { messages?: unknown[] })?.messages ??
              (Array.isArray(nodeOutput) ? (nodeOutput as unknown[]) : []);
            for (const m of msgs) {
              if (m && typeof m === 'object') {
                const content = (m as { content?: unknown }).content;
                const text = extractAgentText(content);
                if (text.trim()) {
                  writeEvent(res, 'agent_response', {
                    source,
                    preview: preview(text, AGENT_PREVIEW_CHARS),
                  });
                }
              }
            }
          }
        }
      }
    }

    if (!clientClosed) {
      writeEvent(res, 'done', { durationMs: Date.now() - started });
    }
  } catch (err) {
    console.error('[investigate] stream error:', err);
    if (!clientClosed) writeEvent(res, 'error', { message: (err as Error).message });
  } finally {
    if (!clientClosed) res.end();
  }
});

export default router;
