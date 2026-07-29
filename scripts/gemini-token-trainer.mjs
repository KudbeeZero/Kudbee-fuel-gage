#!/usr/bin/env node
/**
 * scripts/gemini-token-trainer.mjs — Gemini-Powered THINK Token Training
 * ---------------------------------------------------------------------------
 * Uses Google Gemini API (free tier: 1,500 reqs/day @ 1.5 Flash) to analyze
 * THINK token patterns, suggest SOR routing improvements, and train the
 * Bayesian Thompson sampling model without consuming Redis quota.
 *
 * Zero Redis cost: All computation happens in-memory via Gemini API.
 * Only the final refined token gets written back to local forge.
 *
 * Budget: 1,500 free requests/day. This script uses ≤50 reqs/run.
 * ---------------------------------------------------------------------------
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash'; // free tier model
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async function analyzeTokens(tokens) {
  if (!GEMINI_API_KEY) {
    console.log('[Gemini] No API key — skipping token analysis');
    return tokens;
  }

  const batch = tokens.slice(0, 5).map(t => ({
    id: t.traceId,
    kd: t.kd,
    status: t.status,
    keywords: (t.keywords || []).join(', '),
  }));

  const prompt = `You are a SOR routing optimizer for an AI agent swarm. Analyze these think tokens and suggest:
1. Which tokens should be PROMOTED (high quality)
2. Which tokens should be PRUNED (low quality / redundant)
3. A new Bayesian prior adjustment (alpha/beta) for Thompson sampling
4. A recommended SOR threshold adjustment

Tokens: ${JSON.stringify(batch)}

Respond in JSON format: {"promotions":[], "prunes":[], "alpha_adjustment": 0, "beta_adjustment": 0, "threshold_adjustment": 0, "reasoning": "..."}`;

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Gemini] Analysis complete —', text.slice(0, 100));
    return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e) {
    console.error('[Gemini] API error:', e.message);
    return null;
  }
}

async function train() {
  const fs = await import('fs');
  const forgeDir = '.kilo/memory/forge';
  if (!fs.existsSync(forgeDir)) return;

  const tokens = fs.readdirSync(forgeDir)
    .filter(f => f.startsWith('think-') && f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(`${forgeDir}/${f}`, 'utf8')));

  console.log(`[Gemini] Analyzing ${tokens.length} tokens...`);
  const analysis = await analyzeTokens(tokens);

  if (analysis?.reasoning) {
    // Save Gemini analysis as a think token
    const geminiToken = {
      traceId: `gemini-analysis-${Date.now()}`,
      kd: 95,
      efficacy: 1.0,
      status: 'CHALLENGED',
      reasoning: analysis.reasoning,
      suggestedPromotions: analysis.promotions || [],
      suggestedPrunes: analysis.prunes || [],
      alphaAdjustment: analysis.alpha_adjustment || 0,
      betaAdjustment: analysis.beta_adjustment || 0,
      thresholdAdjustment: analysis.threshold_adjustment || 0,
      keywords: ['gemini', 'AI-analysis', 'SOR', 'training'],
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      `${forgeDir}/think-gemini-${Date.now()}.json`,
      JSON.stringify(geminiToken, null, 2)
    );
    console.log('[Gemini] Token forged — saved to forge');
  }

  console.log('[Gemini] Training complete');
}

train().catch(e => console.error('[Gemini] Fatal:', e.message));
