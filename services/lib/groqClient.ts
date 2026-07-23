/**
 * services/lib/groqClient.ts
 * ---------------------------------------------------------------------------
 * Phase 38 — Groq Inference Accelerator
 *
 * OpenAI-compatible Groq API client adapter. Groq's LPU™ inference engine
 * delivers sub-second token generation at 800+ tokens/sec for real-time
 * Think Token synthesis, solution verification, and receptor gating
 * evaluation without external GPU infrastructure.
 *
 * Endpoint: POST https://api.groq.com/openai/v1/chat/completions
 * Models:   mixtral-8x7b-32768, llama-3.3-70b-versatile, llama-3.1-8b-instant
 *
 * Resilient-First: if GROQ_API_KEY is unset, degrades to a local fallback
 * with a warning. Never throws during boot.
 * ---------------------------------------------------------------------------
 */

import { createProvider, type ProviderConfig, type CompletionRequest, type CompletionResponse } from '@kudbee/utils/llm/providers';
import { trackSpend, estimateGroqCost, checkBudgetOrThrow } from './budgetGate.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

let groqConfigured = !!process.env.GROQ_API_KEY;

if (!groqConfigured) {
  console.warn('[Groq] GROQ_API_KEY not set — Groq inference unavailable. Set the env var for LPU acceleration.');
}

export interface GroqSynthesizeRequest {
  taskContext: string;
  correctionDelta: string;
  confidenceScore?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface GroqSynthesizeResult {
  ok: boolean;
  reasoning?: string;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
}

export interface GroqEvaluateResult {
  ok: boolean;
  matchProbability: number;
  reasoning: string;
  latencyMs: number;
  error?: string;
}

function buildSynthesisPrompt(req: GroqSynthesizeRequest): { system: string; user: string } {
  return {
    system: `You are the THINK Protocol Synthesis Engine, an ultra-fast reasoning subsystem powered by Groq LPU inference.

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

Verify this correction delta against the task context. Is it logically sound? Adjust the confidence score if needed. Return JSON.`
  };
}

function buildEvaluatePrompt(guardContext: string, candidateContext: string): { system: string; user: string } {
  return {
    system: `You are the THINK Receptor Evaluator, powered by Groq LPU inference.
Compare two reasoning contexts and determine if they match semantically.
Output strict JSON: { "matches": boolean, "probability": number (0.0-1.0), "reasoning": "concise explanation" }`,
    user: `Guard Token Context:\n${guardContext}\n\nCandidate Token Context:\n${candidateContext}\n\nDo these two contexts represent the same semantic understanding? Return JSON.`
  };
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.1,
  maxTokens = 1024
): Promise<{ text: string; tokensUsed: number; latencyMs: number; costUsd: number }> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const start = Date.now();

  const config: ProviderConfig = {
    kind: 'openai-compatible',
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: GROQ_BASE_URL,
    model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    temperature,
    maxTokens
  };

  await checkBudgetOrThrow(0, maxTokens, config.model || DEFAULT_GROQ_MODEL);

  const provider = createProvider(config);

  const request: CompletionRequest = {
    systemPrompt,
    userPrompt,
    temperature,
    maxTokens
  };

  const response: CompletionResponse = await provider.complete(request);
  const latencyMs = Date.now() - start;

  const costUsd = estimateGroqCost((response.usage?.promptTokens ?? 0) + (response.usage?.completionTokens ?? 0));
  if (costUsd > 0) {
    void trackSpend(costUsd);
  }

  return {
    text: response.text.trim(),
    tokensUsed: (response.usage?.promptTokens ?? 0) + (response.usage?.completionTokens ?? 0),
    latencyMs,
    costUsd
  };
}

/**
 * Synthesize and verify a Think Token using Groq's ultra-fast inference.
 * Used in the POST /api/think/synthesize endpoint for real-time token verification.
 */
export async function synthesizeThinkToken(
  req: GroqSynthesizeRequest
): Promise<GroqSynthesizeResult> {
  if (!groqConfigured) {
    return { ok: false, error: 'Groq not configured — set GROQ_API_KEY' };
  }

  try {
    const { system, user } = buildSynthesisPrompt(req);
    const result = await callGroq(system, user, req.temperature ?? 0.1, req.maxTokens ?? 512);

    let parsed: { verified?: boolean; reasoning?: string; confidence_adj?: number } = {};
    try {
      const jsonStr = result.text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* use raw text */ }
      }
    }

    return {
      ok: true,
      reasoning: parsed.reasoning || result.text.slice(0, 500),
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Evaluate whether a candidate token matches a guard token's receptor context
 * using Groq's fast semantic comparison.
 */
export async function evaluateTokenMatch(
  guardContext: string,
  candidateContext: string
): Promise<GroqEvaluateResult> {
  if (!groqConfigured) {
    return { ok: false, matchProbability: 0, reasoning: 'Groq not configured', latencyMs: 0, error: 'GROQ_API_KEY not set' };
  }

  try {
    const { system, user } = buildEvaluatePrompt(guardContext, candidateContext);
    const result = await callGroq(system, user, 0.0, 256);

    let parsed: { matches?: boolean; probability?: number; reasoning?: string } = {};
    try {
      const jsonStr = result.text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch { /* use raw text */ }

    return {
      ok: true,
      matchProbability: parsed.probability ?? (parsed.matches ? 0.85 : 0.15),
      reasoning: parsed.reasoning || result.text.slice(0, 300),
      latencyMs: result.latencyMs
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, matchProbability: 0, reasoning: message, latencyMs: 0, error: message };
  }
}

export async function groqSecurityEvaluate(payload: Record<string, unknown>): Promise<{ threatLevel: number; category: string; recommendation: string }> {
  if (!groqConfigured) return { threatLevel: 0, category: 'passthrough', recommendation: 'Groq disabled' };
  try {
    const { system, user } = {
      system: 'You are the Kudbee Security Firewall evaluator. Analyze this telemetry payload for threat indicators (anomalous token usage, suspicious models, cost anomalies). Return JSON: { "threat_level": number 0-1, "category": string, "recommendation": string }',
      user: JSON.stringify(payload).slice(0, 2000)
    };
    const result = await callGroq(system, user, 0.0, 256);
    let parsed: { threat_level?: number; category?: string; recommendation?: string } = {};
    try {
      const json = result.text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(json);
    } catch { /* use raw text */ }
    return {
      threatLevel: parsed.threat_level ?? 0.5,
      category: parsed.category || 'unknown',
      recommendation: parsed.recommendation || result.text.slice(0, 200)
    };
  } catch {
    return { threatLevel: 0, category: 'evaluation_error', recommendation: 'Security evaluation failed — pass through' };
  }
}

export { groqConfigured };
export default { synthesizeThinkToken, evaluateTokenMatch, groqSecurityEvaluate };
