/**
 * services/lib/deepseekClient.ts
 * ---------------------------------------------------------------------------
 * Deepseek Client — OpenAI-compatible API for agent reasoning.
 *
 * Endpoint: POST https://api.deepseek.com/chat/completions
 * Models: deepseek-chat (v3), deepseek-reasoner (r1)
 *
 * Uses DEEPSEEK_API env var. Falls back gracefully when not configured.
 * ---------------------------------------------------------------------------
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

let deepseekConfigured = !!DEEPSEEK_API_KEY;

if (!deepseekConfigured) {
  console.warn('[Deepseek] DEEPSEEK_API not set — agent reasoning disabled');
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DeepseekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepseekCompletionRequest {
  model: string;
  messages: DeepseekMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface DeepseekCompletionResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ── Core Completion ────────────────────────────────────────────────────────

async function deepseekComplete(
  messages: DeepseekMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<{ content: string; tokens: number; model: string }> {
  if (!deepseekConfigured) {
    return { content: '[Deepseek disabled]', tokens: 0, model: 'none' };
  }

  const body: DeepseekCompletionRequest = {
    model: options.model || 'deepseek-chat',
    messages,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.3,
  };

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Deepseek API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data: DeepseekCompletionResponse = await res.json();
  return {
    content: data.choices[0]?.message?.content || '',
    tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
    model: body.model,
  };
}

// ── Agent Reasoning ───────────────────────────────────────────────────────

export async function deepseekReason(
  prompt: string,
  systemContext?: string
): Promise<{ response: string; tokens: number; confidence: number }> {
  if (!deepseekConfigured) {
    return { response: 'Deepseek not configured', tokens: 0, confidence: 0 };
  }

  const messages: DeepseekMessage[] = [];
  if (systemContext) {
    messages.push({ role: 'system', content: systemContext });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const result = await deepseekComplete(messages, {
      model: 'deepseek-chat',
      maxTokens: 2048,
      temperature: 0.4,
    });
    return {
      response: result.content,
      tokens: result.tokens,
      confidence: result.content.length > 50 ? 0.85 : 0.5,
    };
  } catch (err) {
    console.warn('[Deepseek] Reasoning failed:', err instanceof Error ? err.message : String(err));
    return { response: '', tokens: 0, confidence: 0 };
  }
}

export async function deepseekReasonR1(
  prompt: string,
  systemContext?: string
): Promise<{ response: string; tokens: number; reasoning?: string }> {
  if (!deepseekConfigured) {
    return { response: 'Deepseek not configured', tokens: 0 };
  }

  const messages: DeepseekMessage[] = [];
  if (systemContext) {
    messages.push({ role: 'system', content: systemContext });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const result = await deepseekComplete(messages, {
      model: 'deepseek-reasoner',
      maxTokens: 4096,
      temperature: 0.3,
    });
    return {
      response: result.content,
      tokens: result.tokens,
    };
  } catch (err) {
    console.warn('[Deepseek] R1 reasoning failed:', err instanceof Error ? err.message : String(err));
    return { response: '', tokens: 0 };
  }
}

// ── THINK Token Evaluation ────────────────────────────────────────────────

export async function deepseekEvaluateToken(
  token: { context: string; decision: string; outcome: string; kd: number }
): Promise<{ score: number; summary: string; verified: boolean }> {
  if (!deepseekConfigured) {
    return { score: 0, summary: 'Deepseek not available', verified: false };
  }

  const prompt = `Evaluate this agent decision for quality and correctness:

Context: ${token.context}
Decision: ${token.decision}
Outcome: ${token.outcome}
Knowledge Density (KD): ${token.kd}

Rate 0-100 and state if VERIFIED or REJECTED. Be strict.`;

  try {
    const result = await deepseekComplete([
      { role: 'user', content: prompt }
    ], {
      model: 'deepseek-chat',
      maxTokens: 256,
      temperature: 0.1,
    });

    const scoreMatch = result.content.match(/\b(\d{1,3})\b/);
    const score = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[1]))) : 50;
    const verified = result.content.toUpperCase().includes('VERIFIED') && score >= 70;

    return {
      score,
      summary: result.content.slice(0, 200),
      verified,
    };
  } catch (err) {
    console.warn('[Deepseek] Token evaluation failed:', err instanceof Error ? err.message : String(err));
    return { score: 0, summary: 'Evaluation error', verified: false };
  }
}

// ── Security Analysis ─────────────────────────────────────────────────────

export async function deepseekSecurityAnalyze(
  code: string,
  context?: string
): Promise<{ threatLevel: number; vulnerabilities: string[]; recommendation: string }> {
  if (!deepseekConfigured) {
    return { threatLevel: 0, vulnerabilities: [], recommendation: 'Deepseek disabled' };
  }

  const prompt = `Analyze this code for security vulnerabilities. Report threat level (0-100), list vulnerabilities, and recommend fixes:

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`
${code.slice(0, 4000)}
\`\`\`

Respond in JSON: {"threatLevel": number, "vulnerabilities": string[], "recommendation": string}`;

  try {
    const result = await deepseekComplete([
      { role: 'user', content: prompt }
    ], {
      model: 'deepseek-chat',
      maxTokens: 1024,
      temperature: 0.1,
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        threatLevel: Number(parsed.threatLevel) || 0,
        vulnerabilities: Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [],
        recommendation: String(parsed.recommendation || 'No recommendation'),
      };
    } catch {
      return {
        threatLevel: 25,
        vulnerabilities: [],
        recommendation: result.content.slice(0, 200),
      };
    }
  } catch (err) {
    console.warn('[Deepseek] Security analysis failed:', err instanceof Error ? err.message : String(err));
    return { threatLevel: 0, vulnerabilities: [], recommendation: 'Analysis error' };
  }
}

// ── Status / Health ───────────────────────────────────────────────────────

export async function deepseekHealth(): Promise<boolean> {
  if (!deepseekConfigured) return false;
  try {
    await deepseekComplete([{ role: 'user', content: 'ping' }], { maxTokens: 1 });
    return true;
  } catch {
    return false;
  }
}

export function isDeepseekConfigured(): boolean {
  return deepseekConfigured;
}

export { deepseekConfigured };
export default { deepseekReason, deepseekReasonR1, deepseekEvaluateToken, deepseekSecurityAnalyze, deepseekHealth, isDeepseekConfigured };
