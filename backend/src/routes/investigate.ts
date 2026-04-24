import { Router, Request, Response } from 'express';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { getInvestigationAgent } from '../services/agents';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate  —  SSE stream of the deep agent graph.
// Minimal implementation that mirrors the working /test-sse structure.
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PREVIEW = 120;
const AGENT_PREVIEW = 200;

interface InvestigateBody {
  drug?: string;
  scenarioParams?: string;
}

function cap(v: unknown, n: number): string {
  const s = v == null ? '' : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function buildPrompt(drug: string, scenarioParams?: string): string {
  let p = `Investigate the drug shortage situation for: ${drug}.\n\nFollow the investigation process: resolve the drug, find root causes with evidence, delegate risk propagation and mitigation planning to the appropriate subagents, and produce a final report.`;
  if (scenarioParams) p += `\n\nWhat-if: ${scenarioParams}`;
  return p;
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
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  try { (res.socket as unknown as { setNoDelay?: (b: boolean) => void } | null)?.setNoDelay?.(true); } catch { /* noop */ }

  const started = Date.now();
  res.write(`event: start\ndata: ${JSON.stringify({ drug })}\n\n`);

  try {
    const agent = getInvestigationAgent();

    for await (const ev of agent.streamEvents(
      { messages: [{ role: 'user', content: buildPrompt(drug.trim(), scenarioParams?.trim()) }] },
      { version: 'v2', recursionLimit: 10_000 } as Record<string, unknown>,
    )) {
      const kind = ev.event;

      // Model tokens + tool-call chunks
      if (kind === 'on_chat_model_stream') {
        const chunk = ev.data?.chunk as AIMessageChunk | undefined;
        if (chunk) {
          const tcc = chunk.tool_call_chunks ?? [];
          for (const tc of tcc) {
            if (tc.name) {
              let args: unknown = tc.args;
              try { args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args; } catch { /* raw */ }
              res.write(`event: tool_call\ndata: ${JSON.stringify({ name: tc.name, args })}\n\n`);
            }
          }
          if (!tcc.length) {
            const text = typeof chunk.content === 'string' ? chunk.content : '';
            if (text) res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
          }
        }
        continue;
      }

      if (kind === 'on_tool_start') {
        res.write(`event: tool_call\ndata: ${JSON.stringify({ name: ev.name, args: ev.data?.input ?? {} })}\n\n`);
        continue;
      }

      if (kind === 'on_tool_end') {
        const output = ev.data?.output;
        // Side-channel graph payload for UI
        if (ev.name === 'getSupplyChainGraph' && output) {
          let payload: Record<string, unknown> | null = null;
          try { payload = typeof output === 'string' ? JSON.parse(output as string) : (output as Record<string, unknown>); } catch { payload = null; }
          const graph = payload?.graph;
          if (graph && typeof graph === 'object') {
            res.write(`event: graph_data\ndata: ${JSON.stringify({ drug: (payload as { drug?: string }).drug ?? drug, graph })}\n\n`);
          }
        }
        res.write(`event: tool_result\ndata: ${JSON.stringify({ name: ev.name, preview: cap(output, TOOL_PREVIEW) })}\n\n`);
        continue;
      }

      if (kind === 'on_chain_end' && typeof ev.name === 'string' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        res.write(`event: subagent\ndata: ${JSON.stringify({ name: ev.name, status: 'done' })}\n\n`);
        continue;
      }
      if (kind === 'on_chain_start' && typeof ev.name === 'string' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        res.write(`event: subagent\ndata: ${JSON.stringify({ name: ev.name, status: 'started' })}\n\n`);
        continue;
      }
    }

    res.write(`event: done\ndata: ${JSON.stringify({ durationMs: Date.now() - started })}\n\n`);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
  }
  res.end();
});

// Unused import guard
void ToolMessage;
void AGENT_PREVIEW;

export default router;
