import { Router, Request, Response } from 'express';
import { getInvestigationAgent } from '../services/agents';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate
//
// Body: { drug: string, scenarioParams?: string }
// Streams SSE events as the deep agent runs:
//   event: step          → high-level progress marker
//   event: tool_call     → { name, args, id }
//   event: tool_result   → { name, id, result }
//   event: token         → { text }
//   event: subagent      → { name, status, task? }
//   event: todos         → { todos: [...] }
//   event: graph_data    → { drug, graph: { nodes, links } }
//   event: message       → { role, content }
//   event: done          → { durationMs }
//   event: error         → { message }
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * LangGraph events we translate into domain SSE events.
 * See https://docs.langchain.com/oss/javascript/langgraph/streaming for the event taxonomy.
 */
interface LcEvent {
  event: string;
  name?: string;
  run_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  data?: {
    input?: unknown;
    output?: unknown;
    chunk?: unknown;
  };
}

function extractTokenText(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== 'object') return null;
  // LangChain AIMessageChunk has .content which can be string or array of parts
  const content = (chunk as { content?: unknown }).content;
  if (typeof content === 'string') return content || null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String(part.text);
        return '';
      })
      .join('');
    return text || null;
  }
  return null;
}

function summarizeToolOutput(output: unknown): Record<string, unknown> {
  if (output == null) return { empty: true };
  if (typeof output === 'string') {
    try {
      return { preview: output.slice(0, 400) };
    } catch {
      return { raw: '[unserializable]' };
    }
  }
  if (typeof output === 'object') {
    // Don't dump the whole graph blob to the agent transcript — already emitted as graph_data
    const shallow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
      if (k === 'graph') {
        shallow[k] = '[omitted — sent as graph_data event]';
        continue;
      }
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v)) shallow[k] = `[${v.length} items]`;
        else shallow[k] = '[object]';
      } else {
        shallow[k] = v;
      }
    }
    return shallow;
  }
  return { value: String(output) };
}

router.post('/', async (req: Request, res: Response) => {
  const { drug, scenarioParams } = (req.body ?? {}) as InvestigateBody;

  if (!drug || typeof drug !== 'string' || !drug.trim()) {
    res.status(400).json({ error: 'Body must include { drug: string }' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const started = Date.now();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
  });

  writeEvent(res, 'step', { phase: 'starting', drug, message: `Beginning investigation of ${drug}` });

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
    const eventStream = agent.streamEvents(
      { messages: [{ role: 'user', content: prompt }] },
      { version: 'v2', recursionLimit: 50 },
    );

    for await (const ev of eventStream as AsyncIterable<LcEvent>) {
      if (clientClosed) break;

      const kind = ev.event;

      // Model token stream → forwarded to UI for live typing effect
      if (kind === 'on_chat_model_stream') {
        const text = extractTokenText(ev.data?.chunk);
        if (text) writeEvent(res, 'token', { text });
        continue;
      }

      // Tool calls
      if (kind === 'on_tool_start') {
        writeEvent(res, 'tool_call', {
          id: ev.run_id,
          name: ev.name,
          args: ev.data?.input ?? {},
        });
        continue;
      }
      if (kind === 'on_tool_end') {
        const output = ev.data?.output;
        writeEvent(res, 'tool_result', {
          id: ev.run_id,
          name: ev.name,
          summary: summarizeToolOutput(output),
        });
        // Side-channel: if this was getSupplyChainGraph, also emit graph_data for the UI panel
        if (ev.name === 'getSupplyChainGraph' && output && typeof output === 'object') {
          // Tool results from StructuredTool with responseFormat:"content" come back as string,
          // but our tools return objects — LangChain wraps them as ToolMessage content.
          // Try both object and stringified JSON forms.
          let payload: Record<string, unknown> | null = null;
          if (typeof output === 'string') {
            try {
              payload = JSON.parse(output);
            } catch {
              payload = null;
            }
          } else {
            payload = output as Record<string, unknown>;
          }
          const graph = payload?.graph;
          if (graph && typeof graph === 'object') {
            writeEvent(res, 'graph_data', {
              drug: payload?.drug ?? drug,
              graph,
            });
          }
        }
        continue;
      }

      // Subagent lifecycle (chain events named after subagent)
      if (kind === 'on_chain_start' && ev.name && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        writeEvent(res, 'subagent', { name: ev.name, status: 'spawned' });
        continue;
      }
      if (kind === 'on_chain_end' && ev.name && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        writeEvent(res, 'subagent', { name: ev.name, status: 'done' });
        continue;
      }

      // Final AI message from the main agent (on_chain_end of the top-level graph).
      // This carries the investigation summary the model produced.
      if (kind === 'on_chain_end' && (ev.name === 'LangGraph' || ev.name === '__start__' || ev.name === 'agent')) {
        const output = ev.data?.output;
        if (output && typeof output === 'object') {
          const messages: unknown[] = (output as { messages?: unknown[] }).messages ?? [];
          const last = messages[messages.length - 1];
          if (last && typeof last === 'object') {
            const content = (last as { content?: unknown }).content;
            if (content && typeof content === 'string' && content.trim()) {
              writeEvent(res, 'message', { role: 'assistant', content });
            }
          }
        }
        continue;
      }

      // We leave other events (chat_model_start/end, chain_start/end for main graph) silent
      // to avoid drowning the client. Frontend can re-derive from token/tool_call streams.
    }

    if (!clientClosed) {
      writeEvent(res, 'done', { durationMs: Date.now() - started });
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[investigate] Stream error:', err);
    if (!clientClosed) writeEvent(res, 'error', { message: msg });
  } finally {
    if (!clientClosed) res.end();
  }
});

export default router;
