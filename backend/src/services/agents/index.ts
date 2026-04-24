import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent, type SubAgent } from 'deepagents';
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

// Singleton — cleared on globalThis reset (process restart / ts-node-dev respawn).
// Call invalidateAgent() after changing .env to pick up new model settings.
type GlobalWithAgent = typeof globalThis & { __investigationAgent?: ReturnType<typeof buildAgent> };

export function invalidateAgent(): void {
  (globalThis as GlobalWithAgent).__investigationAgent = undefined;
}

/**
 * Env vars:
 *   OPENROUTER_API_KEY      required
 *   OPENROUTER_BASE_URL     default https://openrouter.ai/api/v1
 *   OPENROUTER_MAIN_MODEL   default anthropic/claude-sonnet-4.5
 *   OPENROUTER_SUB_MODEL    default anthropic/claude-haiku-4.5
 */
function buildModel(modelName: string): BaseChatModel {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY missing. Add it to backend/.env.');
  }
  const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  return new ChatOpenAI({
    model: modelName,
    apiKey,
    temperature: 0,
    maxRetries: 2,
    streaming: true,
    configuration: {
      baseURL,
      defaultHeaders: {
        'HTTP-Referer': 'https://drug-shortage-copilot.local',
        'X-Title': 'Drug Shortage Copilot',
      },
    },
  });
}

function buildAgent() {
  const mainModel = buildModel(
    process.env.OPENROUTER_MAIN_MODEL ?? 'anthropic/claude-sonnet-4.5',
  );
  const subModel = buildModel(
    process.env.OPENROUTER_SUB_MODEL ?? 'anthropic/claude-haiku-4.5',
  );

  const riskPropagator: SubAgent = {
    name: 'risk_propagator',
    description:
      'Identifies other drugs at risk because they share a manufacturer, plant, or ingredient ' +
      'with the drug in shortage. Use after identifying root-cause manufacturers. ' +
      'Returns a ranked list of at-risk drugs with reasoning.',
    systemPrompt: RISK_PROPAGATOR_PROMPT,
    tools: RISK_TOOLS,
    model: subModel,
  };

  const mitigationPlanner: SubAgent = {
    name: 'mitigation_planner',
    description:
      'Produces a role-specific action plan (pharmacy/procurement/clinical) including ' +
      'therapeutic alternatives from the FDA Orange Book.',
    systemPrompt: MITIGATION_PLANNER_PROMPT,
    tools: MITIGATION_TOOLS,
    model: subModel,
  };

  const scenarioAnalyst: SubAgent = {
    name: 'scenario_analyst',
    description:
      'Answers "what if" questions about supply chain disruptions. ' +
      'Only invoke when the user explicitly asks a hypothetical.',
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
