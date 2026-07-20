// packages/utils/src/llm/providers.ts
// ---------------------------------------------------------------------------
// LLM Provider Factory — abstracts Gemini (Google) vs local/edge vLLM
// endpoints behind a unified interface.
//
// This module is the single source of truth for:
//   1. The \`ModelProvider\` interface contract.
//   2. Concrete provider implementations (Gemini, vLLM/Open-Weights).
//   3. The abstract factory that selects the correct provider at runtime.
//   4. The \`wrapPromptForOpenWeights\` helper that enforces deterministic
//      XML output constraints for non-Gemini models.
// ---------------------------------------------------------------------------

/**
 * Supported provider identifiers.
 */
export type ProviderKind = 'gemini' | 'vllm' | 'openai-compatible';

/**
 * Configuration required to instantiate a provider.
 */
export interface ProviderConfig {
  kind: ProviderKind;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  /** Generation temperature. Defaults to 0.2 for deterministic output. */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** For vLLM/open-weights: the system prompt wrapper to enforce XML output. */
  xmlWrapper?: boolean;
}

/**
 * Minimal completion request shape shared across providers.
 */
export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional JSON schema hint for structured output providers. */
  responseSchema?: unknown;
}

/**
 * Minimal completion response shape shared across providers.
 */
export interface CompletionResponse {
  text: string;
  model: string;
  provider: ProviderKind;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * The ModelProvider contract. Every LLM backend must implement these methods.
 */
export interface ModelProvider {
  readonly kind: ProviderKind;
  readonly model: string;

  /**
   * Send a completion request and return the generated text.
   * Throws on network/auth/parse errors so callers can fall back.
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Health-check ping. Returns true when the provider is reachable and
   * authenticated (or unauthenticated for local models).
   */
  healthCheck(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Gemini Provider
// ---------------------------------------------------------------------------

export class GeminiProvider implements ModelProvider {
  readonly kind: ProviderKind = 'gemini';
  readonly model: string;

  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('GeminiProvider requires an apiKey');
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 1024;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: this.apiKey });

    const combinedPrompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
    const response = (await client.models.generateContent({
      model: this.model,
      contents: combinedPrompt,
      config: {
        temperature: request.temperature ?? this.temperature,
        maxOutputTokens: request.maxTokens ?? this.maxTokens
      }
    })) as { text: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };

    const text = response.text ?? '';
    return {
      text,
      model: this.model,
      provider: 'gemini',
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// vLLM / OpenAI-Compatible Provider (local or edge)
// ---------------------------------------------------------------------------

export class VLLMProvider implements ModelProvider {
  readonly kind: ProviderKind = 'vllm';
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly xmlWrapper: boolean;

  constructor(config: ProviderConfig) {
    if (!config.baseUrl) {
      throw new Error('VLLMProvider requires a baseUrl');
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey ?? 'no-key';
    this.model = config.model;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 1024;
    this.xmlWrapper = config.xmlWrapper ?? true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemPrompt = this.xmlWrapper
      ? wrapPromptForOpenWeights(request.systemPrompt, request.userPrompt)
      : `${request.systemPrompt}\n\n${request.userPrompt}`;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.userPrompt }
        ],
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`vLLM completion failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices[0]?.message?.content ?? '';
    return {
      text,
      model: this.model,
      provider: 'vllm',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-Compatible Provider (generic fallback for DeepSeek, etc.)
// ---------------------------------------------------------------------------

export class OpenAICompatibleProvider implements ModelProvider {
  readonly kind: ProviderKind = 'openai-compatible';
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly xmlWrapper: boolean;

  constructor(config: ProviderConfig) {
    if (!config.baseUrl) {
      throw new Error('OpenAICompatibleProvider requires a baseUrl');
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey ?? 'no-key';
    this.model = config.model;
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens ?? 1024;
    this.xmlWrapper = config.xmlWrapper ?? true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemPrompt = this.xmlWrapper
      ? wrapPromptForOpenWeights(request.systemPrompt, request.userPrompt)
      : `${request.systemPrompt}\n\n${request.userPrompt}`;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.userPrompt }
        ],
        temperature: request.temperature ?? this.temperature,
        max_tokens: request.maxTokens ?? this.maxTokens
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI-compatible completion failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices[0]?.message?.content ?? '';
    return {
      text,
      model: this.model,
      provider: 'openai-compatible',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Abstract Factory
// ---------------------------------------------------------------------------

export function createProvider(config: ProviderConfig): ModelProvider {
  switch (config.kind) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'vllm':
      return new VLLMProvider(config);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config);
    default:
      throw new Error(`Unsupported provider kind: ${config.kind satisfies never}`);
  }
}

// ---------------------------------------------------------------------------
// Prompt Wrapper for Open-Weights Models
// ---------------------------------------------------------------------------

/**
 * Wrap a system prompt + user prompt pair with deterministic XML output
 * constraints so non-Gemini models respect our structured output contract.
 *
 * Open-weight models (vLLM, DeepSeek, Llama, etc.) are trained on chat
 * templates that may ignore or strip system messages. This wrapper ensures
 * the deterministic XML tags survive by embedding the system instructions
 * directly into the user turn with explicit delimiters.
 *
 * @param systemPrompt The canonical system prompt (Phase 5 laws + skills).
 * @param userPrompt The user's raw input.
 * @returns A single prompt string guaranteed to produce deterministic XML.
 */
export function wrapPromptForOpenWeights(systemPrompt: string, userPrompt: string): string {
  return `<SYSTEM_INSTRUCTION>
${systemPrompt}
</SYSTEM_INSTRUCTION>

<USER_INPUT>
${userPrompt}
</USER_INPUT>

<OUTPUT_CONTRACT>
You MUST emit your response inside exactly one of these tags:
- <ACTION>...</ACTION> for executable code or actions.
- <THINK:STORM>...</THINK:STORM> for chain-of-thought reasoning.
- <PENDING_APPROVAL>...</PENDING_APPROVAL> for governance halts.

Do NOT emit prose outside these tags. No markdown code blocks.
</OUTPUT_CONTRACT>`;
}
