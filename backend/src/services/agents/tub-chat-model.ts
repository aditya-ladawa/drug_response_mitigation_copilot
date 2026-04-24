/**
 * TypeScript port of the TU Braunschweig KI-Toolbox chat model.
 *
 * The KI-Toolbox API is NOT OpenAI-compatible — it has its own protocol:
 *   POST /api/v1/chat/send
 *   Body: { thread, prompt, model, customInstructions, hideCustomInstructions }
 *   Response: JSON-lines stream of { type: "start"|"chunk"|"done", ... }
 *
 * Tools are NOT supported natively. We use prompt-based tool calling: the system
 * prompt instructs the model to emit JSON of the form:
 *   { "type": "tool_call", "name": "<tool>", "arguments": {...} }
 *   { "type": "final", "content": "<answer>" }
 * We parse that back into an AIMessage with tool_calls populated, so LangGraph's
 * ReactAgent (and deepagents on top of it) works as if the model had native tools.
 */

import { randomUUID } from 'crypto';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import {
  BaseChatModel,
  type BaseChatModelParams,
  type BindToolsInput,
  type BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs';
import type { Runnable } from '@langchain/core/runnables';

export interface TubChatModelFields extends BaseChatModelParams {
  apiKey: string;
  apiBase?: string;
  endpoint?: string;
  modelName?: string;
  customInstructions?: string;
  hideCustomInstructions?: boolean;
  timeoutMs?: number;
}

interface TubCallOptions extends BaseChatModelCallOptions {
  tools?: BindToolsInput[];
  tool_choice?: string;
}

interface ToolCallJson {
  type: 'tool_call';
  name: string;
  arguments: Record<string, unknown>;
}

interface FinalJson {
  type: 'final';
  content: string;
}

type ModelJson = ToolCallJson | FinalJson | Record<string, unknown>;

export class TubChatModel extends BaseChatModel<TubCallOptions> {
  apiKey: string;
  apiBase: string;
  endpoint: string;
  modelName: string;
  customInstructions: string;
  hideCustomInstructions: boolean;
  timeoutMs: number;

  lc_namespace = ['drug_shortage', 'models', 'tub'];

  constructor(fields: TubChatModelFields) {
    super(fields);
    this.apiKey = fields.apiKey;
    this.apiBase = (fields.apiBase ?? 'https://ki-toolbox.tu-braunschweig.de').replace(/\/+$/, '');
    this.endpoint = fields.endpoint ?? '/api/v1/chat/send';
    this.modelName = fields.modelName ?? 'gpt-5.4-mini';
    this.customInstructions = fields.customInstructions ?? '';
    this.hideCustomInstructions = fields.hideCustomInstructions ?? true;
    this.timeoutMs = fields.timeoutMs ?? 120_000;
  }

  _llmType(): string {
    return 'tub-chatbot';
  }

  bindTools(tools: BindToolsInput[], kwargs?: Partial<TubCallOptions>): Runnable {
    // Runnable.withConfig merges { tools, tool_choice } into default call options,
    // so _generate() reads them from `options.tools`. (`bind` was renamed to
    // `withConfig` in recent LangChain.js versions.)
    return this.withConfig({
      tools,
      ...(kwargs ?? {}),
    } as Partial<TubCallOptions>);
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const tools = Array.isArray(options?.tools) ? (options.tools as BindToolsInput[]) : [];
    const toolChoice = options?.tool_choice;
    const prompt = this.buildPrompt(messages, tools, toolChoice);

    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${this.endpoint}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thread: null,
          prompt,
          model: this.modelName,
          customInstructions: this.customInstructions,
          hideCustomInstructions: this.hideCustomInstructions,
        }),
        signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok || !response.body) {
      const detail = response.body ? await response.text().catch(() => '') : '';
      throw new Error(
        `KI-Toolbox ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
      );
    }

    let text = '';
    let threadId: string | null = null;
    let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // ignore non-JSON keep-alives
          }
          const type = event.type;
          if (type === 'start') {
            threadId = (event.conversationThread as string | null) ?? null;
          } else if (type === 'chunk') {
            const content = String(event.content ?? '');
            if (content) {
              text += content;
              // Callback failures must not abort the response — swallow + log.
              try {
                await runManager?.handleLLMNewToken(content);
              } catch (err) {
                console.warn('[TubChatModel] token callback error:', (err as Error).message);
              }
            }
          } else if (type === 'done') {
            text = String(event.response ?? text);
            threadId = (event.conversationThread as string | null) ?? threadId;
            usage = {
              input_tokens: Number(event.promptTokens) || undefined,
              output_tokens: Number(event.responseTokens) || undefined,
              total_tokens: Number(event.totalTokens) || undefined,
            };
          }
        }
      }
      // Flush any trailing buffered bytes
      buffer += decoder.decode();
    } finally {
      // Ensure the reader is released even if the loop threw.
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      try {
        const event = JSON.parse(trailing);
        if (event.type === 'done') {
          text = String(event.response ?? text);
          usage = {
            input_tokens: Number(event.promptTokens) || undefined,
            output_tokens: Number(event.responseTokens) || undefined,
            total_tokens: Number(event.totalTokens) || undefined,
          };
        }
      } catch {
        // ignore
      }
    }

    const message = this.toAiMessage(text, tools, threadId, usage);
    const generation: ChatGeneration = {
      text: typeof message.content === 'string' ? message.content : '',
      message,
    };
    return { generations: [generation], llmOutput: usage ? { tokenUsage: usage } : {} };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Prompt construction — must exactly match the contract the model is trained
  // against. If you change the tool_call / final JSON shape, update toAiMessage too.
  // ─────────────────────────────────────────────────────────────────────────

  private buildPrompt(
    messages: BaseMessage[],
    tools: BindToolsInput[],
    toolChoice?: string,
  ): string {
    const parts: string[] = ['You are a helpful assistant.'];

    if (tools.length) {
      parts.push(
        'Tools are available.',
        'Respond with valid JSON only.',
        'If you need a tool, return exactly this shape:',
        '{"type":"tool_call","name":"<tool_name>","arguments":{}}',
        'If you can answer the user, return exactly this shape:',
        '{"type":"final","content":"<answer>"}',
        `Tool choice mode: ${toolChoice ?? 'auto'}`,
        'Available tools:',
        this.renderTools(tools),
      );
    }

    parts.push('Conversation:');
    parts.push(...messages.map((m) => this.renderMessage(m)));
    return parts.join('\n\n');
  }

  private renderTools(tools: BindToolsInput[]): string {
    return tools
      .map((tool) => {
        const t = tool as { name?: string; description?: string; schema?: unknown };
        return JSON.stringify({
          name: t.name ?? 'unknown_tool',
          description: t.description ?? '',
          arguments: this.summarizeZodSchema(t.schema),
        });
      })
      .join('\n');
  }

  /** Cheap introspection of a Zod object schema → { fieldName: "type" }. */
  private summarizeZodSchema(schema: unknown): Record<string, string> {
    if (!schema || typeof schema !== 'object') return {};
    const shape =
      (schema as { shape?: Record<string, unknown>; _def?: { shape?: () => unknown } }).shape ??
      (schema as { _def?: { shape?: () => unknown } })._def?.shape?.();
    if (!shape || typeof shape !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(shape as Record<string, unknown>)) {
      const typeName =
        (val as { _def?: { typeName?: string } })._def?.typeName ??
        (val as { constructor?: { name?: string } })?.constructor?.name ??
        'any';
      out[key] = String(typeName).replace(/^Zod/, '').toLowerCase();
    }
    return out;
  }

  /** AIMessage/ToolMessage.content can be a string OR an array of content blocks. */
  private stringifyContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            const p = part as { text?: unknown; type?: string };
            if (typeof p.text === 'string') return p.text;
            return JSON.stringify(part);
          }
          return String(part ?? '');
        })
        .join('');
    }
    if (content == null) return '';
    return JSON.stringify(content);
  }

  private renderMessage(message: BaseMessage): string {
    const content = this.stringifyContent(message.content);
    if (message instanceof SystemMessage) return `system: ${content}`;
    if (message instanceof HumanMessage) return `user: ${content}`;
    if (message instanceof ToolMessage) {
      return `tool[${message.name ?? ''}][${message.tool_call_id}]: ${content}`;
    }
    if (message instanceof AIMessage) {
      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length) {
        return `assistant_tool_call: ${JSON.stringify(toolCalls)}`;
      }
      return `assistant: ${content}`;
    }
    return `${message._getType()}: ${content}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Response parsing
  // ─────────────────────────────────────────────────────────────────────────

  private toAiMessage(
    text: string,
    tools: BindToolsInput[],
    threadId: string | null,
    usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined,
  ): AIMessage {
    const parsed = this.parseJsonObject(text);
    const toolNames = new Set(
      tools.map((t) => (t as { name?: string }).name).filter((n): n is string => Boolean(n)),
    );

    if (parsed && this.isToolCall(parsed) && toolNames.has(parsed.name)) {
      return new AIMessage({
        content: '',
        tool_calls: [
          {
            name: parsed.name,
            args: parsed.arguments,
            id: `call_${randomUUID().replace(/-/g, '')}`,
            type: 'tool_call',
          },
        ],
        additional_kwargs: threadId ? { thread: threadId } : {},
        usage_metadata: usage ? {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          total_tokens: usage.total_tokens ?? 0,
        } : undefined,
      });
    }

    const finalText = parsed && this.isFinal(parsed) ? String(parsed.content ?? '') : text;

    return new AIMessage({
      content: finalText,
      additional_kwargs: threadId ? { thread: threadId } : {},
      usage_metadata: usage ? {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
      } : undefined,
    });
  }

  private isToolCall(v: ModelJson): v is ToolCallJson {
    const obj = v as Record<string, unknown>;
    return (
      obj.type === 'tool_call' &&
      typeof obj.name === 'string' &&
      obj.arguments != null &&
      typeof obj.arguments === 'object'
    );
  }

  private isFinal(v: ModelJson): v is FinalJson {
    return (v as Record<string, unknown>).type === 'final';
  }

  private parseJsonObject(text: string): ModelJson | null {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      cleaned = cleaned.trim();
    }
    try {
      const parsed = JSON.parse(cleaned);
      return typeof parsed === 'object' && parsed !== null ? (parsed as ModelJson) : null;
    } catch {
      return null;
    }
  }
}
