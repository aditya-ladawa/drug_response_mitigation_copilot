import { ChatAnthropic } from '@langchain/anthropic';
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

// Singleton cache — build once, reuse across requests.
// Kept on globalThis to survive ts-node-dev hot reloads during local dev.
type GlobalWithAgent = typeof globalThis & { __investigationAgent?: ReturnType<typeof buildAgent> };

/**
 * Build a chat model for a specific model name.
 * Routes via OpenRouter (OpenAI-compatible ChatOpenAI) when OPENROUTER_API_KEY is set.
 * Falls back to ChatAnthropic if an Anthropic key is available (only for Claude models).
 *
 * Defaults from env:
 *   - OPENROUTER_MAIN_MODEL  (main agent)    — deepseek/deepseek-v4-pro
 *   - OPENROUTER_SUB_MODEL   (subagents)     — deepseek/deepseek-v4-flash
 */
function buildOpenRouterModel(modelName: string): BaseChatModel {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY missing. Add it to backend/.env to run the investigation agent.',
    );
  }
  const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  return new ChatOpenAI({
    model: modelName,
    apiKey: key,
    temperature: 0,
    maxRetries: 3,
    streaming: true,
    configuration: { baseURL },
  });
}

function buildMainModel(): BaseChatModel {
  if (process.env.OPENROUTER_API_KEY) {
    const modelName = process.env.OPENROUTER_MAIN_MODEL ?? 'deepseek/deepseek-v4-pro';
    return buildOpenRouterModel(modelName);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
    return new ChatAnthropic({
      model,
      apiKey: anthropicKey,
      temperature: 0,
      maxRetries: 3,
      streaming: true,
    });
  }
  throw new Error(
    'No LLM credentials found. Set OPENROUTER_API_KEY (preferred) or ANTHROPIC_API_KEY in backend/.env.',
  );
}

function buildSubagentModel(): BaseChatModel {
  if (process.env.OPENROUTER_API_KEY) {
    const modelName = process.env.OPENROUTER_SUB_MODEL ?? 'deepseek/deepseek-v4-flash';
    return buildOpenRouterModel(modelName);
  }
  // Fall back to the main model for subagents if OpenRouter not configured.
  return buildMainModel();
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
