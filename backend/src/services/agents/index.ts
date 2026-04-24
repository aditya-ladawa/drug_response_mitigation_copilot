import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent, type SubAgent } from 'deepagents';
import { TubChatModel } from './tub-chat-model';
import {
  ALL_TOOLS,
  MITIGATION_TOOLS,
  RISK_TOOLS,
  SCENARIO_TOOLS,
} from './tools';
import {
  MAIN_SYSTEM_PROMPT,
  MITIGATION_PLANNER_PROMPT,
  RISK_PROPAGATOR_PROMPT,
  SCENARIO_ANALYST_PROMPT,
} from './prompts';

// Singleton cache — build once, reuse across requests.
// Kept on globalThis to survive ts-node-dev hot reloads during local dev.
type GlobalWithAgent = typeof globalThis & { __investigationAgent?: ReturnType<typeof buildAgent> };

/**
 * Extract the API base (up to `/api/v1` or similar) and the endpoint path.
 * Accepts either the base URL alone (`.../api/v1`) or the full endpoint
 * (`.../api/v1/chat/send`). Always separates them since the KI-Toolbox uses
 * the custom `/chat/send` path, not OpenAI's `/chat/completions`.
 */
function splitTubUrl(raw: string): { apiBase: string; endpoint: string } {
  let url = raw.trim().replace(/\/+$/, '');
  const match = url.match(/^(.*?)(\/api\/v\d+\/chat\/(?:send|completions))$/i);
  if (match) return { apiBase: match[1], endpoint: match[2] };
  // Fallback: treat raw as apiBase, use default endpoint
  return { apiBase: url, endpoint: '/api/v1/chat/send' };
}

/**
 * Build a TUB chat model for a specific model name.
 *
 * Env:
 *   - TUB_API_KEY          required
 *   - TUB_BASE_URL         full endpoint (e.g. https://ki-toolbox.tu-braunschweig.de/api/v1/chat/send)
 *                          or just the host (https://ki-toolbox.tu-braunschweig.de)
 *   - TUB_MAIN_MODEL       (default gpt-5.4)
 *   - TUB_SUB_MODEL        (default gpt-5.4-mini)
 */
function buildTubModel(modelName: string): BaseChatModel {
  const key = process.env.TUB_API_KEY;
  if (!key) {
    throw new Error(
      'TUB_API_KEY missing. Add it to backend/.env to run the investigation agent.',
    );
  }
  const rawBase = process.env.TUB_BASE_URL ?? 'https://ki-toolbox.tu-braunschweig.de/api/v1/chat/send';
  const { apiBase, endpoint } = splitTubUrl(rawBase);
  return new TubChatModel({
    apiKey: key,
    apiBase,
    endpoint,
    modelName,
  });
}

function buildMainModel(): BaseChatModel {
  const modelName = process.env.TUB_MAIN_MODEL ?? 'gpt-5.4';
  return buildTubModel(modelName);
}

function buildSubagentModel(): BaseChatModel {
  const modelName = process.env.TUB_SUB_MODEL ?? 'gpt-5.4-mini';
  return buildTubModel(modelName);
}

function buildAgent() {
  const mainModel = buildMainModel();
  const subModel = buildSubagentModel();

  const riskPropagator: SubAgent = {
    name: 'risk_propagator',
    description:
      'Identifies OTHER drugs at risk because they share a manufacturer, plant, or ingredient ' +
      'with a drug already in shortage. Use after you have identified root-cause manufacturers. ' +
      'Returns a ranked list of at-risk drugs with reasoning.',
    systemPrompt: RISK_PROPAGATOR_PROMPT,
    tools: RISK_TOOLS,
    model: subModel,
  };

  const mitigationPlanner: SubAgent = {
    name: 'mitigation_planner',
    description:
      'Produces a role-specific action plan (pharmacy/procurement/clinical) including ' +
      'therapeutic alternatives from the FDA Orange Book. Use after root causes and risk ' +
      'propagation are established.',
    systemPrompt: MITIGATION_PLANNER_PROMPT,
    tools: MITIGATION_TOOLS,
    model: subModel,
  };

  const scenarioAnalyst: SubAgent = {
    name: 'scenario_analyst',
    description:
      'Answers "what if" questions about supply chain disruptions (e.g. a plant shutdown, ' +
      'expanded import alert). Only invoke when the user explicitly asks a hypothetical.',
    systemPrompt: SCENARIO_ANALYST_PROMPT,
    tools: SCENARIO_TOOLS,
    model: subModel,
  };

  return createDeepAgent({
    model: mainModel,
    tools: ALL_TOOLS,
    systemPrompt: MAIN_SYSTEM_PROMPT,
    subagents: [riskPropagator, mitigationPlanner, scenarioAnalyst],
  });
}

export function getInvestigationAgent(): ReturnType<typeof buildAgent> {
  const g = globalThis as GlobalWithAgent;
  if (!g.__investigationAgent) {
    g.__investigationAgent = buildAgent();
  }
  return g.__investigationAgent;
}
