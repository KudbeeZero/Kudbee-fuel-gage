// services/agent/gemini-teacher.js
// ---------------------------------------------------------------------------
// Gemini Teacher — the language layer that makes the collective get smarter
// together, powered by THINK Tokens + DTHINK.
//
// The vision: cheap Gemini agents (~gemini-flash-latest) don't just fix
// things — they TEACH how. A fix produces (a) the concrete fix and (b) a
// distilled LESSON. That lesson is minted as a THINK TOKEN — the collective's
// knowledge currency — embedded into pgvector and broadcast on the
// `kudbee:think:tokens` bus (DTHINK pipeline). Every future agent recalls it
// semantically before asking an LLM. This is "teach via language and
// communication so the collective self-heals and gets smarter together":
//
//   1. Learn:     Gemini synthesizes the lesson from a failure + context
//   2. Mint:      lesson → THINK token (pgvector embedding + Redis bus) via
//                 services/memory/thinkTokenGenerator.ts mintThinkToken()
//   3. Broadcast: mintThinkToken publishes to kudbee:think:tokens → DTHINK
//   4. Recall:    semantic recall via vectorStore.getRelevantThinkTokens()
//                 answers known patterns WITHOUT burning a fresh LLM call
//
// Resilient-first (mirrors inceptionClient.ts): if GEMINI_API_KEY is unset or
// Neon is down, teachFromFailure degrades to a signature-only write and never
// throws during boot.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMENI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Local signature log (cheap recall of exact repeats WITHOUT LLM + pgvector).
const TEACH_DIR = path.join(REPO_ROOT, '.kilo', 'memory', 'lessons');
const SIG_FILE = path.join(TEACH_DIR, 'signatures.jsonl');

let _client = null;
function getClient() {
  if (!_client && GEMINI_API_KEY) _client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _client;
}

function ensureSigDir() { try { fs.mkdirSync(TEACH_DIR, { recursive: true }); } catch {} }
function appendSig(rec) {
  ensureSigDir();
  try { fs.appendFileSync(SIG_FILE, JSON.stringify(rec) + '\n', 'utf8'); return true; } catch { return false; }
}
function readSigs(limit = 500) {
  ensureSigDir();
  try {
    if (!fs.existsSync(SIG_FILE)) return [];
    return fs.readFileSync(SIG_FILE, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).slice(-limit).reverse();
  } catch { return []; }
}

// Deterministic failure signature for exact-repeat recall (zero LLM cost).
export function signatureOf(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim().split(/\s+/).filter((w) => w.length > 3).slice(0, 8).join(':');
}

// Step 1 — Learn: Gemini synthesizes the teaching (lesson + prevention + the
// reasoning steps that go into the THINK token). No LLM call if key unset.
export async function synthesizeLesson({ failure, context, fixDestination }) {
  const out = {
    signature: signatureOf(failure),
    failure, context: context || '', fixDestination: fixDestination || '',
    lesson: null, prevention: null, reasoning: null, target: null,
    provider: 'gemini', model: GEMINI_MODEL, ok: false,
  };
  const client = getClient();
  if (!client) return { ...out, error: 'GEMINI_API_KEY not set — signature only' };
  try {
    const resp = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{
          text:
            `You are the THINK Teaching Engine. Analyze this failure and teach a SHORT lesson another agent can follow ` +
            `NEXT TIME without re-deriving it. Output STRICT JSON:\n` +
            `{\n  "lesson": "one paragraph teaching the fix",\n  "prevention": "one-line rule",\n  "reasoning": "3 concise reasoning steps",\n  "target": "where the fix applies"}\n\n` +
            `FAILURE:\n${failure}\n\nCONTEXT:\n${context || '(none)'}\n\nFIX DIRECTION:\n${fixDestination || '(none)'}`,
        }],
      }],
    });
    const text = resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    let parsed = null;
    try { parsed = JSON.parse(text.replace(/```(?:json)?\s*/g, '').trim()); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
    if (!parsed || !parsed.lesson) {
      out.lesson = text.trim().slice(0, 500);
    } else {
      out.lesson = parsed.lesson; out.prevention = parsed.prevention || '';
      out.reasoning = parsed.reasoning || ''; out.target = parsed.target || '';
    }
    out.ok = true;
    return out;
  } catch (err) {
    return { ...out, error: err instanceof Error ? err.message : String(err) };
  }
}

// Step 2 + 3 — Mint + Broadcast: persist the lesson as a THINK TOKEN via the
// canonical DTHINK pipeline (pgvector embedding + kudbee:think:tokens bus).
export async function teachFromFailure({ agentId, failure, context, fixDestination, traceId }) {
  const lesson = await synthesizeLesson({ failure, context, fixDestination });

  // Always record the exact signature for cheap exact-repeat recall.
  appendSig({
    id: `sig-${Date.now().toString(36)}`,
    ts: new Date().toISOString(),
    signature: lesson.signature,
    failure: lesson.failure,
    ok: lesson.ok,
    error: lesson.error || null,
  });

  // If Gemini produced a lesson, mint it as a THINK token (DTHINK).
  let token = { ok: false, error: 'no lesson' };
  if (lesson.ok && lesson.lesson) {
    try {
      const { mintThinkToken } = await import('../memory/thinkTokenGenerator.ts');
      const reasoningSteps = [lesson.lesson];
      if (lesson.reasoning) reasoningSteps.push(lesson.reasoning);
      if (lesson.prevention) reasoningSteps.push(`prevention: ${lesson.prevention}`);
      token = await mintThinkToken({
        agentId: agentId || 'gemini-teacher',
        traceId: traceId || `teach-${Date.now()}`,
        correctionDelta: lesson.lesson,
        reasoningSteps,
        taskContext: { failure, context: context || '', target: lesson.target || '' },
        failedState: { fixDestination: fixDestination || '' },
        status: 'TEACHING', // THINK token kind: a taught lesson
        kd: 1,
        cost: 0,
      });
    } catch (e) {
      token = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { lesson, token, signature: lesson.signature };
}

// Step 4 — Recall: before solving, look up known teaching by signature first
// (exact repeats = zero LLM), then semantic pgvector recall for similar ones.
export async function recallTeaching(query) {
  const sig = signatureOf(query);

  // 1) Exact signature match (cheap, deterministic).
  const sigs = readSigs();
  const exact = sigs.find((s) => s && s.signature === sig);
  if (exact) return { source: 'signature', hit: true, lesson: { lesson: `known pattern (${sig}); reuse prior teaching.` } };

  // 2) Semantic recall from pgvector think_tokens (DTHINK memory).
  let sem = { hit: false, token: null };
  try {
    const { getRelevantThinkTokens } = await import('../memory/vectorStore.ts');
    const relevant = await getRelevantThinkTokens(query, 1, { filterStatus: ['TEACHING', 'PENDING_APPROVAL', 'CLOSED'] });
    if (relevant && relevant.length > 0) {
      const t = relevant[0];
      sem = { hit: true, token: { id: t.traceId, lesson: t.thoughtSummary || t.trajectory_text || null, similarity: t.similarity } };
    }
  } catch {}

  return { source: 'pgvector', hit: sem.hit, token: sem.hit ? sem.token : null };
}

export function teachingsSummary() {
  const sigs = readSigs();
  return {
    taught: sigs.filter((s) => s && s.ok).length,
    exactReuseCandidates: sigs.length,
    model: GEMINI_MODEL,
    keyConfigured: !!GEMINI_API_KEY,
    memory: 'think_tokens (pgvector 1536-dim) via DTHINK pipeline',
    bus: 'kudbee:think:tokens',
  };
}

export default { synthesizeLesson, teachFromFailure, recallTeaching, signatureOf, teachingsSummary };
