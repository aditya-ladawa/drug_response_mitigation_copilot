import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent, type CompiledSubAgent } from 'deepagents';
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

// Singleton — cleared on process restart.
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
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing. Add it to backend/.env.');
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

/**
 * Build a subagent as a CompiledSubAgent (passes a pre-built ReactAgent as `runnable`).
 *
 * This skips createDeepAgent's internal normalizeSubagentSpec, which would otherwise
 * inject todoListMiddleware, filesystemMiddleware, summarizationMiddleware, etc. into
 * every subagent — giving them write_todos and file tools they don't need and shouldn't
 * have. With CompiledSubAgent, the runnable is used as-is.
 */
function compileSubagent(
  name: string,
  description: string,
  systemPrompt: string,
  tools: Parameters<typeof createAgent>[0]['tools'],
  model: BaseChatModel,
): CompiledSubAgent {
  const runnable = createAgent({
    model: model as Parameters<typeof createAgent>[0]['model'],
    tools,
    systemPrompt,
  });
  return { name, description, runnable };
}

function buildAgent() {
  const mainModel = buildModel(
    process.env.OPENROUTER_MAIN_MODEL ?? 'anthropic/claude-sonnet-4.5',
  );
  const subModel = buildModel(
    process.env.OPENROUTER_SUB_MODEL ?? 'anthropic/claude-haiku-4.5',
  );

  const riskPropagator = compileSubagent(
    'risk_propagator',
    'Identifies other drugs at risk because they share a manufacturer, plant, or ingredient ' +
    'with the drug in shortage. Use after identifying root-cause manufacturers. ' +
    'Returns a ranked list of at-risk drugs with reasoning.',
    RISK_PROPAGATOR_PROMPT,
    RISK_TOOLS,
    subModel,
  );

  const mitigationPlanner = compileSubagent(
    'mitigation_planner',
    'Produces a role-specific action plan (pharmacy/procurement/clinical) including ' +
    'therapeutic alternatives from the FDA Orange Book.',
    MITIGATION_PLANNER_PROMPT,
    MITIGATION_TOOLS,
    subModel,
  );

  const scenarioAnalyst = compileSubagent(
    'scenario_analyst',
    'Answers "what if" questions about supply chain disruptions. ' +
    'Only invoke when the user explicitly asks a hypothetical.',
    SCENARIO_ANALYST_PROMPT,
    SCENARIO_TOOLS,
    subModel,
  );

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
