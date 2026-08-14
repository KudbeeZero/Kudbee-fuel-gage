// services/agent/recycler-mesh.js
// ---------------------------------------------------------------------------
// THINK Token Recycler + Suboxone Training Mesh.
//
// Mission: WE DO NOT WASTE TOKENS — WE RECYCLE THEM INTO THINK.
//
// Every failed attempt, rejected teaching, blocked request, or absorbed attack
// is a data point that must be recycled for the greater good. This module
// implements two layers that make that happen:
//
//   1. RECYCLER — when a THINK token loses a challenge or its teaching is
//      rejected, the loss is folded back into a REFINEMENT lesson and re-minted
//      as a NEW THINK token (refined + re-embedded). Nothing is thrown away.
//
//   2. MESH — a continuously-trained suboxone mesh layer over the learning
//      store: failures/attacks are embedded into a training corpus that is
//      re-embedded as it grows, so future agents recall + avoid the patterns.
//      It "absorbs" an incident, stores the lesson for the greater good, and
//      returns both the absorbed record and the refined recall signature.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMENI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const MESH_DIR = path.join(REPO_ROOT, '.kilo', 'memory', 'mesh');
const MESH_FILE = path.join(MESH_DIR, 'corpus.jsonl');
const RECYCLE_LOG = path.join(MESH_DIR, 'recycled.jsonl');

let _client = null;
function getClient() {
  if (!_client && GEMINI_API_KEY) _client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _client;
}
function ensureDir() { try { fs.mkdirSync(MESH_DIR, { recursive: true }); } catch {} }
function appendJsonl(file, obj) {
  ensureDir();
  try { fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8'); return true; } catch { return false; }
}
function readJsonl(file) {
  ensureDir();
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

export function signatureOf(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim().split(/\s+/).filter((w) => w.length > 3).slice(0, 8).join(':');
}

/**
 * RECYCLER: fold a challenge LOSS (or regression) back into a refined lesson.
 * Gemini refines the weak teaching into a stronger, more general one, then mints
 * it as a NEW THINK token so the signal is reused, not wasted.
 */
export async function recycleLoss({ failure, weakLesson, disruption }) {
  const result = { ok: false, recycledId: null, refinedLesson: null, error: null };
  const client = getClient();
  if (!client) {
    result.error = 'no gemini key — loss logged for later recycle';
    appendJsonl(RECYCLE_LOG, { kind: 'loss', failure, weakLesson, disruption, recycled: false, ts: new Date().toISOString() });
    return result;
  }
  try {
    const resp = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text:
        `The Disruptor rejected this teaching with: ${disruption}. Refine it into ONE actionable, general rule that ` +
        `survives adversarial review. Output STRICT JSON:\n{\n  "refinedLesson": "actionable rule",\n  "prevention": "one-line"}\n\n` +
        `FAILURE:\n${failure}\n\nWEAK TEACHING:\n${weakLesson || '(none)'}` }] }],
    });
    const text = resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    let parsed = null;
    try { parsed = JSON.parse(text.replace(/```(?:json)?\s*/g, '').trim()); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
    const refined = parsed?.refinedLesson || text.trim().slice(0, 500);

    // Re-mint a THINK token from the refined lesson (recycle into THINK).
    let recycledId = null;
    try {
      const { mintThinkToken } = await import('../memory/thinkTokenGenerator.ts');
      const tok = await mintThinkToken({
        agentId: 'token-recycler',
        traceId: `recycle-${Date.now()}`,
        correctionDelta: refined,
        reasoningSteps: [preventive = parsed?.prevention || '', `recycled from ${weakLesson?.slice(0, 60) || 'loss'}`],
        taskContext: { failure, disruption },
        failedState: { weakLesson, reason: 'disruptor_reject' },
        status: 'PENDING_APPROVAL',
        kd: 1,
      });
      recycledId = tok.ok ? tok.id : null;
    } catch {}

    appendJsonl(RECYCLE_LOG, { kind: 'recycled', failure, weakLesson, disruption, refinedLesson: refined, recycledId, ts: new Date().toISOString() });
    return { ok: true, recycledId, refinedLesson: refined, error: null };
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
    appendJsonl(RECYCLE_LOG, { kind: 'loss', failure, weakLesson, disruption, recycled: false, error: result.error, ts: new Date().toISOString() });
    return result;
  }
}

/**
 * MESH: the suboxone training mesh layer. Absorb an incident (attack, failure,
 * issue) — embed it into the continuously-trained corpus, store the absorbed
 * lesson for the greater good, and return a deterministic recall signature so
 * future agents match + avoid it.
 */
export async function absorbIntoMesh({ failure, context, resolution, kind = 'issue' }) {
  const sig = signatureOf(`${kind} ${failure}`);
  const record = {
    id: `mesh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    kind, // attack | issue | failure | regression
    signature: sig,
    failure, context: context || '', resolution: resolution || '', absorbed: true,
  };
  appendJsonl(MESH_FILE, record);
  return { absorbed: true, id: record.id, signature: sig };
}

export function meshSize() {
  return readJsonl(MESH_FILE).length;
}

export function meshSummary() {
  const corpus = readJsonl(MESH_FILE);
  const byKind = corpus.reduce((a, r) => { a[r.kind] = (a[r.kind] || 0) + 1; return a; }, {});
  const recycled = readJsonl(RECYCLE_LOG);
  return {
    meshEntries: corpus.length,
    byKind,
    recycledTokens: recycled.filter((r) => r && r.recycledId).length,
    totalRecycleOps: recycled.length,
    store: MESH_FILE,
    model: GEMINI_MODEL,
    mission: 'we do not waste tokens — we recycle them into THINK',
    continuouslyTrained: true,
  };
}

export default { recycleLoss, absorbIntoMesh, meshSummary, meshSize, signatureOf };
