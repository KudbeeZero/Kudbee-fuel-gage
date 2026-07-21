/**
 * services/governance/router.js
 * ---------------------------------------------------------------------------
 * Logic Tagging Service — the "Governance & Intelligence Router".
 *
 * This module is the thought-indexing layer. It:
 *   1. Stores "Proposed Logic Actions" in Redis (status: 'PROPOSED').
 *   2. Lets a human approve a proposed action, moving it into the
 *      `PROVEN` index (status: 'PROVEN').
 *   3. Exposes `matchLogic(prompt)` which searches the PROVEN index for a
 *      high-confidence tag match against an incoming prompt. On a match the
 *      caller should use the proven "Fast Brain" path; otherwise it should
 *      fall back to the "Slow Brain" (LLM reasoning).
 *
 * Redis access uses the Upstash REST API (no extra SDK dependency). When the
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars are absent we fall
 * back to an in-process memory store so the pipeline keeps working in local
 * dev and in tests.
 *
 * The tag registry is intentionally data-driven so new "Proven Thoughts" can
 * be added by simply calling registerTag() (or by approving proposed actions
 * through the dashboard).
 * ---------------------------------------------------------------------------
 */

// Minimal Upstash Redis REST helper (no SDK needed).
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_ENABLED = Boolean(REDIS_URL && REDIS_TOKEN);

async function redisJson(command, args = []) {
  const url = `${REDIS_URL}/${command}/${args.map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Upstash ${command} failed: ${res.status}`);
  }
  const body = await res.json();
  return body.result;
}

// In-memory fallback store (keyed by full redis key).
const memoryStore = new Map();

async function kvGet(key) {
  if (REDIS_ENABLED) {
    try {
      const raw = await redisJson('get', [key]);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  return memoryStore.get(key) ?? null;
}

async function kvSet(key, value) {
  const payload = JSON.stringify(value);
  if (REDIS_ENABLED) {
    try {
      await redisJson('set', [key, payload]);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memoryStore.set(key, value);
}

async function kvDel(key) {
  if (REDIS_ENABLED) {
    try {
      await redisJson('del', [key]);
    } catch {
      /* ignore */
    }
  }
  memoryStore.delete(key);
}

// --- Key conventions ---
// governance:proposed:<id> -> { id, action, tags, prompt, status:'PROPOSED', created_at }
// governance:proven:<id>   -> { id, action, tags, prompt, status:'PROVEN', proven_at }
// governance:index        -> { proposed: [ids], proven: [ids] }

const INDEX_KEY = 'governance:index';

async function readIndex() {
  const idx = await kvGet(INDEX_KEY);
  return idx || { proposed: [], proven: [] };
}

async function writeIndex(index) {
  await kvSet(INDEX_KEY, index);
}

// --- Extensible tag registry ---
// Each tag maps to matching keywords (lowercased substrings) plus an optional
// weight. Add new tags by pushing to TAGS or calling registerTag().
const TAGS = [
  { tag: 'react-ui', keywords: ['react', 'component', 'jsx', 'tsx', 'tailwind', 'ui', 'frontend', 'dashboard'], weight: 1 },
  { tag: 'database-query', keywords: ['sql', 'query', 'postgres', 'select', 'insert', 'database', 'schema', 'migration'], weight: 1 },
  { tag: 'redis-cache', keywords: ['redis', 'cache', 'upstash', 'ttl', 'invalidate'], weight: 1 },
  { tag: 'telemetry', keywords: ['telemetry', 'otel', 'trace', 'span', 'metric', 'observability'], weight: 1 },
  { tag: 'routing', keywords: ['route', 'gateway', 'proxy', 'fallback', 'load balance', 'circuit breaker'], weight: 1 },
  { tag: 'security', keywords: ['firewall', 'guardrail', 'inject', 'redact', 'pii', 'auth', 'token'], weight: 1 },
];

export function registerTag(def) {
  if (!def || !def.tag || !Array.isArray(def.keywords)) return;
  const existing = TAGS.find((t) => t.tag === def.tag);
  if (existing) {
    existing.keywords = Array.from(new Set([...existing.keywords, ...def.keywords]));
    if (typeof def.weight === 'number') existing.weight = def.weight;
  } else {
    TAGS.push({ weight: 1, ...def });
  }
}

// Score a prompt against the proven logic entries. Returns the best match.
function keywordsForTag(tag) {
  const def = TAGS.find((t) => t.tag === tag);
  return def ? def.keywords : [tag];
}

function scorePromptAgainstTags(prompt, entries) {
  const text = (prompt || '').toLowerCase();
  let best = null;
  for (const entry of entries) {
    let score = 0;
    const keywords = (entry.tags || []).flatMap((tag) => keywordsForTag(tag));
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > 0) {
      const confidence = Math.min(1, (score * (entry.weight || 1)) / 2);
      if (!best || confidence > best.confidence) {
        best = { id: entry.id, action: entry.action, tags: entry.tags, prompt: entry.prompt, confidence };
      }
    }
  }
  return best;
}

/**
 * matchLogic(prompt)
 * Searches the PROVEN index for an existing logic path matching the prompt's
 * semantic meaning (via tag/keyword matching). Returns either a proven path
 * (Fast Brain) or a flag to initiate Slow Brain LLM reasoning.
 */
export async function matchLogic(prompt) {
  const index = await readIndex();
  if (!index.proven.length) {
    return { matched: false, reason: 'no_proven_logic', route: 'SLOW_BRAIN' };
  }

  const provenEntries = [];
  for (const id of index.proven) {
    const entry = await kvGet(`governance:proven:${id}`);
    if (entry) provenEntries.push(entry);
  }

  const best = scorePromptAgainstTags(prompt, provenEntries);
  if (best && best.confidence >= 0.34) {
    return { matched: true, route: 'FAST_BRAIN', confidence: best.confidence, logic: best };
  }

  return { matched: false, reason: 'low_confidence', route: 'SLOW_BRAIN' };
}

// --- Proposed / Proven lifecycle ---

export async function listProposed() {
  const index = await readIndex();
  const out = [];
  for (const id of index.proposed) {
    const entry = await kvGet(`governance:proposed:${id}`);
    if (entry) out.push(entry);
  }
  return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Create a new proposed governance action.
 * @param {{ action: string; tags?: string[]; prompt?: string; id?: string; status?: string; agentId?: string }} opts
 */
export async function proposeAction({ action, tags = [], prompt = '', id, status = 'PROPOSED', agentId }) {
  const finalId = id || `ga-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const entry = {
    id: finalId,
    action,
    tags: Array.isArray(tags) ? tags : [],
    prompt,
    status,
    agent_id: agentId || undefined,
    created_at: new Date().toISOString(),
  };
  await kvSet(`governance:proposed:${finalId}`, entry);
  const index = await readIndex();
  if (!index.proposed.includes(finalId)) index.proposed.push(finalId);
  await writeIndex(index);
  return entry;
}

export async function approveAction(id) {
  const entry = await kvGet(`governance:proposed:${id}`);
  if (!entry) return null;
  const proven = { ...entry, status: 'PROVEN', proven_at: new Date().toISOString() };
  await kvSet(`governance:proven:${id}`, proven);
  await kvDel(`governance:proposed:${id}`);

  const index = await readIndex();
  index.proposed = index.proposed.filter((x) => x !== id);
  if (!index.proven.includes(id)) index.proven.push(id);
  await writeIndex(index);
  return proven;
}

export async function rejectAction(id) {
  const entry = await kvGet(`governance:proposed:${id}`);
  if (!entry) return null;
  await kvDel(`governance:proposed:${id}`);
  const index = await readIndex();
  index.proposed = index.proposed.filter((x) => x !== id);
  await writeIndex(index);
  return entry;
}

export async function proposeSentinelAction({ action, tags = [], prompt = '', id }) {
  const finalId = id || `gov-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return proposeAction({
    action,
    tags: Array.isArray(tags) ? tags : [],
    prompt,
    id: finalId,
    status: 'PENDING_APPROVAL',
    agentId: 'EDGE_SENTINEL'
  });
}

export const router = {
  matchLogic,
  listProposed,
  proposeAction,
  proposeSentinelAction,
  approveAction,
  rejectAction,
  registerTag,
  redisEnabled: REDIS_ENABLED,
};

export default router;
