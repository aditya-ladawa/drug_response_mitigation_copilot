import { Router, Request, Response } from 'express';
import { AIMessageChunk } from '@langchain/core/messages';
import { like, sql } from 'drizzle-orm';
import { db } from '../db';
import { shortageRecords } from '../db/schema';
import { getInvestigationAgent } from '../services/agents';
import { findDrugByName, getSupplyChainGraph, serialize } from '../services/graph';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/investigate  —  SSE stream of the deep agent graph.
//
// Events:
//   event: start        { drug }
//   event: tool_call    { name, args }                  agent invoking a tool
//   event: tool_result  { name, preview }               tool output @120 chars
//   event: token        { text }                         streamed LLM text
//   event: graph_data   { drug, graph }                  force-graph JSON
//   event: subagent     { name, status }                 subagent lifecycle
//   event: done         { durationMs }
//   event: error        { message }
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PREVIEW = 120;

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

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamLocalInvestigation(res: Response, drug: string, started: number): Promise<void> {
  const cleanDrug = drug.trim();
  const pattern = `%${cleanDrug.toLowerCase().replace(/%/g, '')}%`;
  const shortages = db
    .select()
    .from(shortageRecords)
    .where(like(sql`LOWER(${shortageRecords.drugName})`, pattern))
    .limit(8)
    .all();

  writeSse(res, 'tool_call', { name: 'searchShortages', args: { drugName: cleanDrug } });
  await wait(180);
  writeSse(res, 'tool_result', {
    name: 'searchShortages',
    preview:
      shortages.length > 0
        ? `Found ${shortages.length} shortage record(s), including ${shortages[0].drugName}.`
        : `No exact shortage rows found for ${cleanDrug}; using graph context where available.`,
  });

  const drugNode = findDrugByName(cleanDrug);
  if (drugNode) {
    const dbId = parseInt(drugNode.id.split(':')[1], 10);
    const graph = serialize(getSupplyChainGraph(dbId, 3));
    await wait(180);
    writeSse(res, 'graph_data', { drug: drugNode.label ?? cleanDrug, graph });
  }

  await wait(180);
  writeSse(res, 'subagent', { name: 'risk_propagator', status: 'done' });
  await wait(180);
  writeSse(res, 'subagent', { name: 'mitigation_planner', status: 'done' });
  await wait(180);
  writeSse(res, 'done', { durationMs: Date.now() - started, mode: 'local-fallback' });
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
  writeSse(res, 'start', { drug });

  if (!process.env.OPENROUTER_API_KEY) {
    try {
      await streamLocalInvestigation(res, drug, started);
    } catch (err) {
      writeSse(res, 'error', { message: (err as Error).message });
    }
    res.end();
    return;
  }

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
              writeSse(res, 'tool_call', { name: tc.name, args });
            }
          }
          if (!tcc.length) {
            const text = typeof chunk.content === 'string' ? chunk.content : '';
            if (text) writeSse(res, 'token', { text });
          }
        }
        continue;
      }

      if (kind === 'on_tool_start') {
        writeSse(res, 'tool_call', { name: ev.name, args: ev.data?.input ?? {} });
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
            writeSse(res, 'graph_data', { drug: (payload as { drug?: string }).drug ?? drug, graph });
          }
        }
        writeSse(res, 'tool_result', { name: ev.name, preview: cap(output, TOOL_PREVIEW) });
        continue;
      }

      if (kind === 'on_chain_end' && typeof ev.name === 'string' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        writeSse(res, 'subagent', { name: ev.name, status: 'done' });
        continue;
      }
      if (kind === 'on_chain_start' && typeof ev.name === 'string' && /^(risk_propagator|mitigation_planner|scenario_analyst)$/.test(ev.name)) {
        writeSse(res, 'subagent', { name: ev.name, status: 'started' });
        continue;
      }
    }

    writeSse(res, 'done', { durationMs: Date.now() - started });
  } catch (err) {
    writeSse(res, 'error', { message: (err as Error).message });
  }
  res.end();
});

export default router;
