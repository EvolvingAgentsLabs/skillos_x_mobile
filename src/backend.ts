// src/backend.ts
// Multi-backend support: Anthropic native API + OpenRouter (Gemini, Gemma4).
// All backends expose the same generate() interface so the agent is backend-agnostic.

import type { ChatMessage, ToolDefinition, ToolCall, GenerateResult } from './types';

// ── Backend interface ──────────────────────────────────────────

export interface Backend {
  generate(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    toolChoice?: 'auto' | 'none',
  ): Promise<GenerateResult>;
  getModel(): string;
  getProvider(): string;
}

// ── Config ─────────────────────────────────────────────────────

export interface BackendConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
}

// ── OpenRouter Backend (Gemini + Gemma4) ───────────────────────

export class OpenRouterBackend implements Backend {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly maxRetries: number;
  private readonly provider: string;

  constructor(config: BackendConfig = {}, provider = 'openrouter') {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.model = config.model || process.env.AGENT_MODEL || 'google/gemma-4-26b-a4b-it';
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    this.maxTokens = config.maxTokens || 1024;
    this.temperature = config.temperature ?? 0.3;
    this.maxRetries = config.maxRetries ?? 3;
    this.provider = provider;

    if (!this.apiKey) {
      throw new Error('OpenRouter API key required. Set OPENROUTER_API_KEY or pass config.apiKey');
    }
  }

  getModel(): string { return this.model; }
  getProvider(): string { return this.provider; }

  async generate(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    toolChoice?: 'auto' | 'none',
  ): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toolChoice || 'auto';
    }

    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://github.com/EvolvingAgentsLabs/skillos_x_mobile',
      'X-Title': 'skillos_x_mobile CareCompanion',
    };

    return this.fetchWithRetry(url, headers, JSON.stringify(body));
  }

  private async fetchWithRetry(url: string, headers: Record<string, string>, payload: string): Promise<GenerateResult> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: payload });
        if (!res.ok) {
          const text = await res.text();
          if (res.status >= 500 || res.status === 429) {
            lastErr = new Error(`OpenRouter ${res.status}: ${text}`);
            console.warn(`  [backend:${this.provider}] Retryable error (attempt ${attempt + 1}/${this.maxRetries}): ${res.status}`);
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw new Error(`OpenRouter ${res.status}: ${text}`);
        }

        const json = await res.json() as {
          choices?: Array<{
            message?: { content?: string | null; tool_calls?: ToolCall[] };
            finish_reason?: string;
          }>;
          model?: string;
          usage?: Record<string, number>;
        };
        const choice = json.choices?.[0];
        if (!choice) throw new Error(`OpenRouter returned no choices: ${JSON.stringify(json)}`);

        return {
          message: choice.message?.content ?? null,
          tool_calls: choice.message?.tool_calls,
          finish_reason: choice.finish_reason || 'unknown',
          model: json.model || this.model,
          usage: json.usage || {},
        };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt < this.maxRetries - 1 && (code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT' || lastErr.message.includes('fetch failed'))) {
          console.warn(`  [backend:${this.provider}] Network error, retrying (attempt ${attempt + 1}/${this.maxRetries})`);
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr!;
  }
}

// ── Anthropic Native Backend ───────────────────────────────────

export class AnthropicBackend implements Backend {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly maxRetries: number;

  constructor(config: BackendConfig = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = config.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 1024;
    this.temperature = config.temperature ?? 0.3;
    this.maxRetries = config.maxRetries ?? 3;

    if (!this.apiKey) {
      throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY or pass config.apiKey');
    }
  }

  getModel(): string { return this.model; }
  getProvider(): string { return 'anthropic'; }

  async generate(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    toolChoice?: 'auto' | 'none',
  ): Promise<GenerateResult> {
    // Extract system message
    let system: string | undefined;
    const apiMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content || undefined;
        continue;
      }
      if (msg.role === 'user') {
        apiMessages.push({ role: 'user', content: msg.content || '' });
      } else if (msg.role === 'assistant') {
        const content: AnthropicContentBlock[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* empty */ }
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
        }
        if (content.length > 0) {
          apiMessages.push({ role: 'assistant', content });
        }
      } else if (msg.role === 'tool') {
        // Anthropic: tool_result must be in a user message
        // Check if the last apiMessage is already a user with tool_results
        const last = apiMessages[apiMessages.length - 1];
        const toolResultBlock: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: msg.content || '',
        };

        if (last && last.role === 'user' && Array.isArray(last.content)) {
          (last.content as AnthropicContentBlock[]).push(toolResultBlock);
        } else {
          apiMessages.push({ role: 'user', content: [toolResultBlock] });
        }
      }
    }

    // Convert tool definitions: OpenAI → Anthropic
    const anthropicTools = tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: apiMessages,
    };
    if (system) body.system = system;
    if (anthropicTools && anthropicTools.length > 0) {
      body.tools = anthropicTools;
      if (toolChoice) body.tool_choice = { type: toolChoice };
    }

    const url = 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

        if (!res.ok) {
          const text = await res.text();
          if (res.status >= 500 || res.status === 429) {
            lastErr = new Error(`Anthropic ${res.status}: ${text}`);
            console.warn(`  [backend:anthropic] Retryable error (attempt ${attempt + 1}/${this.maxRetries}): ${res.status}`);
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw new Error(`Anthropic ${res.status}: ${text}`);
        }

        const json = await res.json() as AnthropicResponse;
        return this.parseAnthropicResponse(json);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt < this.maxRetries - 1 && (code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT' || lastErr.message.includes('fetch failed'))) {
          console.warn(`  [backend:anthropic] Network error, retrying (attempt ${attempt + 1}/${this.maxRetries})`);
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr!;
  }

  private parseAnthropicResponse(resp: AnthropicResponse): GenerateResult {
    let message: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of resp.content || []) {
      if (block.type === 'text') {
        message = (message || '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id!,
          type: 'function',
          function: {
            name: block.name!,
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    }

    const finishReason = resp.stop_reason === 'tool_use' ? 'tool_calls'
      : resp.stop_reason === 'end_turn' ? 'stop'
      : resp.stop_reason || 'unknown';

    return {
      message,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: finishReason,
      model: resp.model || this.model,
      usage: {
        prompt_tokens: resp.usage?.input_tokens,
        completion_tokens: resp.usage?.output_tokens,
        total_tokens: (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0),
      },
    };
  }
}

// ── Anthropic types ────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ── Factory ────────────────────────────────────────────────────

export type BackendType = 'gemma4' | 'gemini' | 'anthropic';

const BACKEND_MODELS: Record<BackendType, string> = {
  gemma4: 'google/gemma-4-26b-a4b-it',
  gemini: 'google/gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
};

export function createBackend(type: BackendType, overrides: BackendConfig = {}): Backend {
  console.log(`  [backend] Creating ${type} backend...`);

  if (type === 'anthropic') {
    return new AnthropicBackend({
      model: overrides.model || BACKEND_MODELS.anthropic,
      ...overrides,
    });
  }

  return new OpenRouterBackend({
    model: overrides.model || BACKEND_MODELS[type],
    ...overrides,
  }, type);
}

// ── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
