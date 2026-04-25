/**
 * TU Braunschweig KI-Toolbox chat model.
 *
 * Protocol (NOT OpenAI-compatible):
 *   POST /api/v1/chat/send
 *   Body: { thread, prompt, model, customInstructions, hideCustomInstructions }
 *   Response: JSON-line stream — {type:"start"}, {type:"chunk", content}, {type:"done", response, promptTokens,...}
 *
 * Tools are simulated via prompt-based JSON contract:
 *   {"type":"tool_call","name":"<tool>","arguments":{...}}
 *   {"type":"final","content":"<answer>"}
 * We parse into AIMessage.tool_calls so LangGraph drives the tool loop natively.
 *
 * Streaming: implements _streamResponseChunks so `agent.stream(...,{streamMode:"messages"})`
 * yields token-level AIMessageChunks and `streamEvents` fires on_chat_model_stream.
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
  AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
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
    return this.withConfig({ tools, ...(kwargs ?? {}) } as Partial<TubCallOptions>);
  }

  // ─── Streaming: the primary code path ──────────────────────────────────────
  // LangGraph agents call this for stream_mode: "messages" and streamEvents.
  // Yields AIMessageChunks as TUB sends them, then a final chunk carrying
  // tool_call_chunks if the model requested a tool.

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const tools = Array.isArray(options?.tools) ? (options.tools as BindToolsInput[]) : [];
    const prompt = this.buildPrompt(messages, tools, options?.tool_choice);

    const response = await this.doFetch(prompt, options?.signal);

    let text = '';
    let threadId: string | null = null;
    let usage: UsageMeta | undefined;

    const reader = response.body!.getReader();
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
            continue;
          }
          const type = event.type;
          if (type === 'start') {
            threadId = (event.conversationThread as string | null) ?? null;
          } else if (type === 'chunk') {
            const content = String(event.content ?? '');
            if (content) {
              text += content;
              try {
                await runManager?.handleLLMNewToken(content);
              } catch {
                /* swallow callback errors */
              }
              yield new ChatGenerationChunk({
                text: content,
                message: new AIMessageChunk({ content }),
              });
            }
          } else if (type === 'done') {
            text = String(event.response ?? text);
            threadId = (event.conversationThread as string | null) ?? threadId;
            usage = this.parseUsage(event);
          }
        }
      }
      buffer += decoder.decode();
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }

    const parsed = this.parseJsonObject(text);
    const toolNames = new Set(
      tools.map((t) => (t as { name?: string }).name).filter((n): n is string => Boolean(n)),
    );

    // If the model emitted a tool_call, yield a final chunk with tool_call_chunks.
    // LangChain aggregates these into AIMessage.tool_calls for LangGraph.
    if (parsed && parsed.type === 'tool_call' && typeof parsed.name === 'string' && toolNames.has(parsed.name)) {
      const args = (parsed.arguments ?? {}) as Record<string, unknown>;
      yield new ChatGenerationChunk({
        text: '',
        message: new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              name: parsed.name,
              args: JSON.stringify(args),
              id: `call_${randomUUID().replace(/-/g, '')}`,
              index: 0,
              type: 'tool_call_chunk',
            },
          ],
          additional_kwargs: threadId ? { thread: threadId } : {},
          usage_metadata: usage ? this.normalizeUsage(usage) : undefined,
        }),
      });
    } else if (usage) {
      // Emit a final metadata-only chunk so usage is attached to the aggregated message.
      yield new ChatGenerationChunk({
        text: '',
        message: new AIMessageChunk({
          content: '',
          additional_kwargs: threadId ? { thread: threadId } : {},
          usage_metadata: this.normalizeUsage(usage),
        }),
      });
    }
  }

  // ─── Non-streaming fallback ────────────────────────────────────────────────
  // Some call paths (structured output, non-streaming invoke) hit _generate.
  // Delegate to the streaming path and concat the chunks.

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    let aggregated: ChatGenerationChunk | undefined;
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      aggregated = aggregated ? aggregated.concat(chunk) : chunk;
    }
    if (!aggregated) {
      return {
        generations: [{ text: '', message: new AIMessage({ content: '' }) }],
      };
    }
    return { generations: [aggregated] };
  }

  // ─── HTTP + parsing helpers ────────────────────────────────────────────────

  private async doFetch(prompt: string, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const useSignal = signal ?? controller.signal;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.apiBase}${this.endpoint}`, {
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
        signal: useSignal,
      });
      if (!response.ok || !response.body) {
        const detail = response.body ? await response.text().catch(() => '') : '';
        throw new Error(
          `KI-Toolbox ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
        );
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseUsage(event: Record<string, unknown>): UsageMeta {
    return {
      input_tokens: Number(event.promptTokens) || undefined,
      output_tokens: Number(event.responseTokens) || undefined,
      total_tokens: Number(event.totalTokens) || undefined,
    };
  }

  private normalizeUsage(u: UsageMeta): {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } {
    return {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      total_tokens: u.total_tokens ?? 0,
    };
  }

  // ─── Prompt / message rendering ────────────────────────────────────────────

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

  private stringifyContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            const p = part as { text?: unknown };
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

  private parseJsonObject(text: string): Record<string, unknown> | null {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      cleaned = cleaned.trim();
    }
    try {
      const parsed = JSON.parse(cleaned);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }
}

interface UsageMeta {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}
