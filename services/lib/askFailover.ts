/**
 * services/lib/askFailover.ts — Terminal /ask provider failover
 * ---------------------------------------------------------------------------
 * Gemini rate limits should never break the terminal. This tries providers in
 * order and falls back on rate-limit/API errors:
 *   1. Gemini (gemini-flash-latest) — primary
 *   2. Grok (openai-compatible, api.x.ai) — fallback
 *   3. DeepSeek (openai-compatible, api.deepseek.com) — last resort
 *
 * Serverless-aligned: stateless, env-driven, no new infra.
 * ---------------------------------------------------------------------------
 */

import type { CompletionResponse } from '@kudbee/utils/llm/providers';

export interface AskFailoverOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AskFailoverSuccess {
  ok: true;
  answer: string;
  model: string;
  provider: string;
  latencyMs: number;
  usage: CompletionResponse['usage'] | undefined;
}

export interface AskFailoverFailure {
  ok: false;
  answer: '';
  model: null;
  provider: null;
  latencyMs: 0;
  usage: null;
  errors: string[];
}

export type AskFailoverResult = AskFailoverSuccess | AskFailoverFailure;

interface ProviderAttempt {
  label: string;
  make: () => { complete(req: { systemPrompt: string; userPrompt: string; temperature: number; maxTokens: number }): Promise<CompletionResponse> };
}

export async function askWithFailover(prompt: string, opts: AskFailoverOptions = {}): Promise<AskFailoverResult> {
  const { createProvider } = await import('@kudbee/utils/llm/providers');

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const grokKey = process.env.GROK_API || process.env.XAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API;

  const systemPrompt = opts.systemPrompt ?? 'You are the Kudbee Control Tower assistant. Be concise. Answer the user directly.';
  const maxTokens = opts.maxTokens ?? 512;
  const temperature = opts.temperature ?? 0.3;

  const attempts: ProviderAttempt[] = [
    ...(geminiKey ? [{ label: 'gemini', make: () => createProvider({ kind: 'gemini' as const, model: 'gemini-flash-latest', apiKey: geminiKey, temperature, maxTokens }) }] : []),
    ...(grokKey ? [{ label: 'grok', make: () => createProvider({ kind: 'openai-compatible' as const, baseUrl: 'https://api.x.ai', apiKey: grokKey, model: 'grok-beta', temperature, maxTokens, xmlWrapper: false }) }] : []),
    ...(deepseekKey ? [{ label: 'deepseek', make: () => createProvider({ kind: 'openai-compatible' as const, baseUrl: 'https://api.deepseek.com', apiKey: deepseekKey, model: 'deepseek-chat', temperature, maxTokens, xmlWrapper: false }) }] : []),
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const client = attempt.make();
      const t0 = Date.now();
      const resp = await client.complete({ systemPrompt, userPrompt: prompt, temperature, maxTokens });
      return {
        ok: true,
        answer: resp.text,
        model: resp.model,
        provider: attempt.label,
        latencyMs: Date.now() - t0,
        usage: resp.usage,
      };
    } catch (e) {
      errors.push(`${attempt.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: false, answer: '', model: null, provider: null, latencyMs: 0, usage: null, errors };
}
