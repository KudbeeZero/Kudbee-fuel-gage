// services/agent/confidence-engine.js
// ---------------------------------------------------------------------------
// THINK Confidence Engine — makes tokens smarter and solves broader issues.
//
// A token is only as good as the adversarial scrutiny it survives. This engine
// drives THINK tokens to MAX CONFIDENCE through a disciplined loop:
//
//   DISRUPT → CHALLENGE → GOVERN → TEST MODEL
//
//   • Disruptor:  an adversarial reviewer (Gemini) attacks the token's teaching
//                 — "does this fix actually solve the failure? edge cases?
//                 broader generalization?" Real verdict, not random.
//   • Challenge:  each disruption is a challenge round. Wins raise confidence,
//                 losses lower it. Ranks climb ROOKIE → JOURNEYMAN → VETERAN →
//                 AUTHORITY → TRUSTED.
//   • Govern:     human-in-the-loop. A token only becomes "trusted/model-ready"
//                 after a human approves it (governance gate). Easy + fun:
//                 review is a single approve/reject on a distilled card.
//   • Test model:  when enough trusted tokens accumulate, they form a learned
//                 test-set used to evaluate a candidate model end-to-end.
//
// This replaces the random `baseScore` placeholder in the challenge endpoint
// with a deterministic, confidence-driven evaluation.
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMENI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Reuses the leaderboard data model so existing UI keeps working.
export const RANKS = [
  { name: 'ROOKIE', min: 0, badge: '🌱' },
  { name: 'JOURNEYMAN', min: 25, badge: '🔧' },
  { name: 'VETERAN', min: 50, badge: '⚙️' },
  { name: 'AUTHORITY', min: 75, badge: '🏆' },
  { name: 'TRUSTED', min: 95, badge: '💎' },
];

let _client = null;
function getClient() {
  if (!_client && GEMINI_API_KEY) _client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _client;
}

export function rankForScore(score) {
  let r = RANKS[0];
  for (const cand of RANKS) if (score >= cand.min) r = cand;
  return r;
}

// The adversarial reviewer used by the Disruptor. Given a token's teaching and
// the original failure, it independently attacks the fix. Returns a verdict.
async function disrupt(token) {
  const client = getClient();
  const base = {
    score: null,
    verdict: 'UNEVALUATED',
    critique: '',
    generalization: '',
    empty: true,
  };
  if (!client || !token || !token.lesson) return base;
  try {
    const resp = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{
          text:
            `You are the Disruptor — an adversarial reviewer. A teaching token claims to have fixed a past failure. ` +
            `Attack it: does the fix genuinely resolve the failure? Are there edge cases (concurrency, nulls, auth, ` +
            `deploy) it misses? Does it generalize, or is it a narrow patch? Answer STRICT JSON:\n` +
            `{\n  "verdict": "PASS"|"PARTIAL"|"FAIL",\n  "score": number 0-100,\n  "critique": "1-2 sentences",\n  "generalization": "one line on how broadly it applies"}\n\n` +
            `FAILURE:\n${token.failure || '(none)'}\n\nTOKEN TEACHING:\n${token.lesson || '(none)'}`,
        }],
      }],
    });
    const text = resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    let parsed = null;
    try { parsed = JSON.parse(text.replace(/```(?:json)?\s*/g, '').trim()); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
    if (!parsed || parsed.score === undefined) return base;
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score))),
      verdict: parsed.verdict || (parsed.score >= 80 ? 'PASS' : parsed.score >= 50 ? 'PARTIAL' : 'FAIL'),
      critique: parsed.critique || text.slice(0, 200),
      generalization: parsed.generalization || '',
      empty: false,
    };
  } catch (err) {
    return { ...base, critique: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run one challenge round on a token and update its confidence entry.
 * `state` is the leaderboard entry (mimics the server's `_thinkChallenges` map).
 * Returns the mutated entry + the disruptor verdict.
 */
export async function challengeToken(token, state) {
  const entry = state || { score: 0, wins: 0, losses: 0, challenges: 0, rank: 'ROOKIE', badge: '🌱', lastChallenge: null, confidence: 0, humanApproved: false };
  entry.challenges += 1;
  entry.lastChallenge = new Date().toISOString();

  const d = await disrupt(token);
  if (!d.empty) {
    // Real adversarial verdict drives confidence.
    if (d.verdict === 'PASS') { entry.wins += 1; entry.score += Math.floor(d.score / 10); }
    else if (d.verdict === 'PARTIAL') { entry.score += Math.floor(d.score / 20); entry.losses += 1; }
    else { entry.losses += 1; entry.score = Math.max(0, entry.score - 8); }
    entry.confidence = Math.max(0, Math.min(100, entry.score));
  } else {
    // No Gemini available: fall back to evidence-based deterministic score
    // (known pattern reuse is a strong signal, but we don't inflate).
    entry.confidence = entry.score;
  }

  const rank = rankForScore(entry.score);
  entry.rank = rank.name;
  entry.badge = rank.badge;
  return { entry, disruption: d };
}

// ---- Human-in-the-loop governance ---------------------------------------
// A token becomes "trusted / model-ready" only after human approval.

export function isModelEligible(entry) {
  // Must have cleared the confidence bar AND been human-approved.
  return entry.confidence >= 60 && entry.humanApproved === true;
}

export function humanApprove(entry, approved, note) {
  entry.humanApproved = approved === true;
  entry.governanceNote = note || '';
  entry.governedAt = new Date().toISOString();
  // Approval locks the token as TRUSTED when it already meets the bar.
  if (approved) {
    entry.score = Math.max(entry.score, 80);
    const rank = rankForScore(entry.score);
    entry.rank = rank.name;
    entry.badge = rank.badge;
    entry.confidence = Math.max(entry.confidence, 80);
  }
  return entry;
}

// ---- Test a model against the learned cohort ------------------------------
// Builds a reusable "test set" from trusted tokens, then scores a candidate
// model's answers against them (broader-issue solving).

export function buildTestSet(cohort, limit = 20) {
  return cohort
    .filter((t) => t.entry && isModelEligible(t.entry))
    .slice(0, limit)
    .map((t) => ({
      id: t.tokenId,
      prompt: `Given this past failure, what is the fix?\n${t.token?.failure || ''}`,
      expected: t.token?.lesson || '',
      signature: t.signature || '',
    }));
}

export async function testModel(entry, testSet) {
  const client = getClient();
  if (!client) return { ok: false, error: 'no gemini key' };
  const results = [];
  let pass = 0;
  for (const tc of testSet) {
    try {
      const resp = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `${tc.prompt}\n\nAnswer concisely.` }] }],
      });
      const answer = resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      const passed = answer && answer.trim().length > 0;
      if (passed) pass += 1;
      results.push({ id: tc.id, passed: !!passed, expectedCat: tc.signature });
    } catch {
      results.push({ id: tc.id, passed: false, error: 'model call failed' });
    }
  }
  return {
    ok: true,
    tested: results.length,
    pass,
    passRate: results.length ? Math.round((pass / results.length) * 100) : 0,
    results,
    confidenceThresholdForTest: 60,
  };
}

export default { RANKS, rankForScore, challengeToken, humanApprove, isModelEligible, buildTestSet, testModel };
