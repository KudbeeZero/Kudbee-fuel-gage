/**
 * services/lib/inceptionClient.ts
 * ---------------------------------------------------------------------------
 * Inception Labs Mercury-2 Client Adapter
 *
 * OpenAI-compatible Inception Labs API client adapter. Mercury-2 supports a
 * configurable `reasoning_effort` parameter that controls how much the model
 * thinks before responding.
 *
 * Endpoint: POST https://api.inceptionlabs.ai/v1/chat/completions
 * Model:    mercury-2 (override with INCEPTION_MODEL)
 *
 * Resilient-First: if INCEPTION_API_KEY is unset, degrades gracefully with
 * a warning. Never throws during boot.
 * ---------------------------------------------------------------------------
 */

import { trackSpend, estimateInceptionCost, checkBudgetOrThrow } from './budgetGate.ts';
import { inceptionBreaker } from './circuitBreaker.ts';

const INCEPTION_BASE_URL = 'https://api.inceptionlabs.ai/v1';
const DEFAULT_INCEPTION_MODEL = 'mercury-2';
const INCEPTION_API_KEY = process.env.INCEPTION_API_KEY;

let inceptionConfigured = !!INCEPTION_API_KEY;

if (!inceptionConfigured) {
  console.warn(
    '[Inception] INCEPTION_API_KEY not set — Inception Labs inference unavailable. Set the env var for Mercury-2 reasoning.'
  );
}

export interface InceptionSynthesizeRequest {
  taskContext: string;
  correctionDelta: string;
  confidenceScore?: number;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface InceptionSynthesizeResult {
  ok: boolean;
  reasoning?: string;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
}

export interface InceptionEvaluateResult {
  ok: boolean;
  matchProbability: number;
  reasoning: string;
  latencyMs: number;
  error?: string;
}

function buildSynthesisPrompt(req: InceptionSynthesizeRequest): { system: string; user: string } {
  return {
    system: `You are the THINK Protocol Synthesis Engine, an advanced reasoning subsystem powered by Inception Labs Mercury-2.

Your task is to verify and synthesize a reasoning correction delta against its task context. Output a concise, deterministic verification in strict JSON format with no additional commentary.

Output format:
{
  "verified": boolean,
  "reasoning": "brief verification summary (1-3 sentences)",
  "confidence_adj": number (0.0-1.0, adjusted confidence after verification)
}`,
    user: `Task Context: ${req.taskContext || '(none)'}

Correction Delta: ${req.correctionDelta || '(empty)'}

Current Confidence: ${req.confidenceScore?.toFixed(3) ?? 'N/A'}

Verify this correction delta against the task context. Is it logically sound? Adjust the confidence score if needed. Return JSON.`,
  };
}

function buildEvaluatePrompt(
  guardContext: string,
  candidateContext: string
): { system: string; user: string } {
  return {
    system: `You are the THINK Receptor Evaluator, powered by Inception Labs Mercury-2.
Compare two reasoning contexts and determine if they match semantically.
Output strict JSON: { "matches": boolean, "probability": number (0.0-1.0), "reasoning": "concise explanation" }`,
    user: `Guard Token Context:\n${guardContext}\n\nCandidate Token Context:\n${candidateContext}\n\nDo these two contexts represent the same semantic understanding? Return JSON.`,
  };
}

async function callInception(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.1,
  maxTokens = 1024,
  reasoningEffort: 'low' | 'medium' | 'high' = 'low'
): Promise<{ text: string; tokensUsed: number; latencyMs: number; costUsd: number }> {
  if (!INCEPTION_API_KEY) {
    throw new Error('INCEPTION_API_KEY not configured');
  }

  if (await inceptionBreaker.isOpen()) {
    throw new Error('Inception circuit breaker is open — request rejected');
  }

  const start = Date.now();
  const model = process.env.INCEPTION_MODEL || DEFAULT_INCEPTION_MODEL;

  await checkBudgetOrThrow(0, maxTokens, model);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  };

  try {
    const res = await fetch(`${INCEPTION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INCEPTION_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      await inceptionBreaker.recordFailure();
      throw new Error(`Inception completion failed (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const latencyMs = Date.now() - start;
    const text = data.choices[0]?.message?.content ?? '';
    const tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);

    const costUsd = estimateInceptionCost(tokensUsed);
    if (costUsd > 0) {
      void trackSpend(costUsd);
    }

    await inceptionBreaker.recordSuccess();

    return { text: text.trim(), tokensUsed, latencyMs, costUsd };
  } catch (err) {
    await inceptionBreaker.recordFailure();
    throw err;
  }
}

/**
 * Synthesize and verify a Think Token using Inception Labs Mercury-2 reasoning.
 * Supports configurable `reasoningEffort` to control model thinking depth.
 */
export async function synthesizeThinkToken(
  req: InceptionSynthesizeRequest
): Promise<InceptionSynthesizeResult> {
  if (!inceptionConfigured) {
    return { ok: false, error: 'Inception not configured — set INCEPTION_API_KEY' };
  }

  try {
    const { system, user } = buildSynthesisPrompt(req);
    const result = await callInception(
      system,
      user,
      req.temperature ?? 0.1,
      req.maxTokens ?? 512,
      req.reasoningEffort ?? 'low'
    );

    let parsed: { verified?: boolean; reasoning?: string; confidence_adj?: number } = {};
    try {
      const jsonStr = result.text
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          /* use raw text */
        }
      }
    }

    return {
      ok: true,
      reasoning: parsed.reasoning || result.text.slice(0, 500),
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Evaluate whether a candidate token matches a guard token's receptor context
 * using Inception Labs Mercury-2 semantic comparison.
 */
export async function evaluateTokenMatch(
  guardContext: string,
  candidateContext: string
): Promise<InceptionEvaluateResult> {
  if (!inceptionConfigured) {
    return {
      ok: false,
      matchProbability: 0,
      reasoning: 'Inception not configured',
      latencyMs: 0,
      error: 'INCEPTION_API_KEY not set',
    };
  }

  try {
    const { system, user } = buildEvaluatePrompt(guardContext, candidateContext);
    const result = await callInception(system, user, 0.0, 256);

    let parsed: { matches?: boolean; probability?: number; reasoning?: string } = {};
    try {
      const jsonStr = result.text
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      /* use raw text */
    }

    return {
      ok: true,
      matchProbability: parsed.probability ?? (parsed.matches ? 0.85 : 0.15),
      reasoning: parsed.reasoning || result.text.slice(0, 300),
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, matchProbability: 0, reasoning: message, latencyMs: 0, error: message };
  }
}

export async function inceptionSecurityEvaluate(
  payload: Record<string, unknown>
): Promise<{ threatLevel: number; category: string; recommendation: string }> {
  if (!inceptionConfigured)
    return { threatLevel: 0, category: 'passthrough', recommendation: 'Inception disabled' };
  try {
    const { system, user } = {
      system:
        'You are the Kudbee Security Firewall evaluator. Analyze this telemetry payload for threat indicators (anomalous token usage, suspicious models, cost anomalies). Return JSON: { "threat_level": number 0-1, "category": string, "recommendation": string }',
      user: JSON.stringify(payload).slice(0, 2000),
    };
    const result = await callInception(system, user, 0.0, 256);
    let parsed: { threat_level?: number; category?: string; recommendation?: string } = {};
    try {
      const json = result.text
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(json);
    } catch {
      /* use raw text */
    }
    return {
      threatLevel: parsed.threat_level ?? 0.5,
      category: parsed.category || 'unknown',
      recommendation: parsed.recommendation || result.text.slice(0, 200),
    };
  } catch {
    return {
      threatLevel: 0,
      category: 'evaluation_error',
      recommendation: 'Security evaluation failed — pass through',
    };
  }
}

export { inceptionConfigured };
export default { synthesizeThinkToken, evaluateTokenMatch, inceptionSecurityEvaluate };
