/**
 * services/lib/grokClient.ts
 * ---------------------------------------------------------------------------
 * Grok (xAI) Client — cost-efficient agent reasoning.
 *
 * Endpoint: POST https://api.x.ai/v1/chat/completions
 * Model:    grok-beta  (cheapest — best $/token ratio for $7 budget)
 *           grok-2-latest available as fallback
 *
 * Rate Limits:
 *   25 requests/min, 1000 tokens/min (firm — enforced client-side)
 * Budget:  $7.00 lifetime cap — auto-pauses when exceeded
 *
 * Cost:
 *   Input:  ~$2.00 / 1M tokens
 *   Output: ~$10.00 / 1M tokens
 *   At 1000 tok/min avg, $7 lasts ~500K output tokens or ~3M input tokens.
 * ---------------------------------------------------------------------------
 */

const GROK_API_KEY = process.env.GROK_API || '';
const GROK_BASE_URL = 'https://api.x.ai/v1';

let grokConfigured = !!GROK_API_KEY;

if (!grokConfigured) {
  console.warn('[Grok] GROK_API not set — xAI reasoning disabled');
} else {
  console.log('[Grok] xAI API configured — grok-beta model active');
}

// ── Rate Limiter (token bucket) ───────────────────────────────────────────

const TOKENS_PER_MINUTE = 1000;
const REQUESTS_PER_MINUTE = 25;
const BUDGET_CENTS = 700; // $7.00

interface RateLimiter {
  tokens: number;
  requests: number;
  windowStart: number;
}

const rateLimit: RateLimiter = {
  tokens: TOKENS_PER_MINUTE,
  requests: REQUESTS_PER_MINUTE,
  windowStart: Date.now(),
};

let totalSpendCents = 0;
let totalTokensIn = 0;
let totalTokensOut = 0;
let apiCalls = 0;

function resetRateWindow() {
  const now = Date.now();
  if (now - rateLimit.windowStart > 60_000) {
    rateLimit.tokens = TOKENS_PER_MINUTE;
    rateLimit.requests = REQUESTS_PER_MINUTE;
    rateLimit.windowStart = now;
  }
}

function checkBudget(): boolean {
  if (totalSpendCents >= BUDGET_CENTS) {
    console.warn(`[Grok] Budget exhausted: $${(totalSpendCents / 100).toFixed(2)} of $7.00 — pausing`);
    return false;
  }
  return true;
}

function consumeTokens(inputTokens: number, outputTokens: number): void {
  resetRateWindow();
  rateLimit.tokens -= (inputTokens + outputTokens);
  rateLimit.requests -= 1;

  // Cost calculation (grok-beta pricing: $2/$10 per 1M)
  const costCents = (inputTokens / 1_000_000) * 200 + (outputTokens / 1_000_000) * 1000;
  totalSpendCents += costCents;
  totalTokensIn += inputTokens;
  totalTokensOut += outputTokens;
  apiCalls += 1;
}

function checkRateLimit(): boolean {
  resetRateWindow();
  if (rateLimit.requests <= 0) {
    console.warn('[Grok] Rate limit: 25 req/min reached — waiting for next window');
    return false;
  }
  if (rateLimit.tokens <= 0) {
    console.warn('[Grok] Rate limit: 1000 tok/min reached — waiting for next window');
    return false;
  }
  return true;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GrokCompletionRequest {
  model: string;
  messages: GrokMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface GrokCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ── Core Completion ────────────────────────────────────────────────────────

async function grokComplete(
  messages: GrokMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<{ content: string; tokens: number; model: string }> {
  if (!grokConfigured) {
    return { content: '', tokens: 0, model: 'none' };
  }

  if (!checkBudget()) {
    return { content: '[Budget exhausted]', tokens: 0, model: 'budget-cap' };
  }

  if (!checkRateLimit()) {
    return { content: '[Rate limited]', tokens: 0, model: 'rate-limited' };
  }

  const body: GrokCompletionRequest = {
    model: options.model || 'grok-beta',
    messages,
    max_tokens: options.maxTokens || 512, // conservative — keep costs low
    temperature: options.temperature ?? 0.3,
  };

  let res: Response;
  try {
    res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.warn('[Grok] Connection failed:', err instanceof Error ? err.message : String(err));
    return { content: '', tokens: 0, model: 'connection-error' };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[Grok] API ${res.status}: ${errText.slice(0, 200)}`);
    return { content: '', tokens: 0, model: 'error' };
  }

  const data: GrokCompletionResponse = await res.json();
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  consumeTokens(inputTokens, outputTokens);

  return {
    content: data.choices[0]?.message?.content || '',
    tokens: inputTokens + outputTokens,
    model: body.model,
  };
}

// ── Agent Reasoning ───────────────────────────────────────────────────────

export async function grokReason(
  prompt: string,
  systemContext?: string
): Promise<{ response: string; tokens: number; confidence: number }> {
  if (!grokConfigured) {
    return { response: '', tokens: 0, confidence: 0 };
  }

  const messages: GrokMessage[] = [];
  if (systemContext) {
    messages.push({ role: 'system', content: systemContext });
  }
  messages.push({ role: 'user', content: prompt.slice(0, 2000) }); // truncate to save tokens

  const result = await grokComplete(messages, {
    model: 'grok-beta',
    maxTokens: 512,
    temperature: 0.4,
  });

  return {
    response: result.content,
    tokens: result.tokens,
    confidence: result.content.length > 50 ? 0.8 : 0.4,
  };
}

// ── THINK Token Evaluation ────────────────────────────────────────────────

export async function grokEvaluateToken(
  token: { context: string; decision: string; outcome: string; kd: number }
): Promise<{ score: number; summary: string; verified: boolean }> {
  if (!grokConfigured) {
    return { score: 0, summary: '', verified: false };
  }

  const prompt = `Rate this agent decision 0-100. Context: ${token.context.slice(0, 300)}. Decision: ${token.decision.slice(0, 200)}. Outcome: ${token.outcome.slice(0, 200)}. KD: ${token.kd}. Reply with number only.`;

  const result = await grokComplete([
    { role: 'user', content: prompt }
  ], {
    model: 'grok-beta',
    maxTokens: 16,
    temperature: 0.1,
  });

  const scoreMatch = result.content.match(/\b(\d{1,3})\b/);
  const score = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[1]))) : 50;

  return {
    score,
    summary: result.content.slice(0, 100),
    verified: score >= 70,
  };
}

// ── Security Analysis ─────────────────────────────────────────────────────

export async function grokSecurityAnalyze(
  code: string,
  context?: string
): Promise<{ threatLevel: number; vulnerabilities: string[]; recommendation: string }> {
  if (!grokConfigured) {
    return { threatLevel: 0, vulnerabilities: [], recommendation: '' };
  }

  const prompt = `Analyze for security vulnerabilities (0-100 threat level). Context: ${context || 'none'}. Code: ${code.slice(0, 1500)}. Reply: THREAT:NUMBER VULNS:list REC:advice`;

  const result = await grokComplete([
    { role: 'user', content: prompt }
  ], {
    model: 'grok-beta',
    maxTokens: 256,
    temperature: 0.1,
  });

  const threatMatch = result.content.match(/THREAT:(\d+)/);
  const vulnsMatch = result.content.match(/VULNS:(.+?)(?:REC:|$)/);
  const recMatch = result.content.match(/REC:(.+)$/);

  return {
    threatLevel: threatMatch ? Math.min(100, Number(threatMatch[1])) : 0,
    vulnerabilities: vulnsMatch ? vulnsMatch[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
    recommendation: recMatch ? recMatch[1].trim() : result.content.slice(0, 150),
  };
}

// ── Health & Status ───────────────────────────────────────────────────────

export async function grokHealth(): Promise<boolean> {
  if (!grokConfigured) return false;
  const result = await grokComplete(
    [{ role: 'user', content: 'ping' }],
    { model: 'grok-beta', maxTokens: 4, temperature: 0 }
  );
  return result.tokens > 0;
}

export function grokStatus(): {
  configured: boolean;
  budgetUsed: number;
  budgetTotal: number;
  apiCalls: number;
  tokensIn: number;
  tokensOut: number;
  rateLimit: { tokensRemaining: number; requestsRemaining: number; nextResetMs: number };
} {
  resetRateWindow();
  return {
    configured: grokConfigured,
    budgetUsed: totalSpendCents,
    budgetTotal: BUDGET_CENTS,
    apiCalls,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    rateLimit: {
      tokensRemaining: rateLimit.tokens,
      requestsRemaining: rateLimit.requests,
      nextResetMs: Math.max(0, 60_000 - (Date.now() - rateLimit.windowStart)),
    },
  };
}

export function isGrokConfigured(): boolean {
  return grokConfigured;
}

export { grokConfigured };
export default { grokReason, grokEvaluateToken, grokSecurityAnalyze, grokHealth, grokStatus, isGrokConfigured };
