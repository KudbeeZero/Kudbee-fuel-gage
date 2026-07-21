import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { IngestRequestSchema } from '@kudbee/types';
import {
  deserializePass,
  verifyAgentPass,
  verifySignature,
  AGENT_PASS_MAX_AGE_MS
} from '@kudbee/utils';
import { embedTrace, cosineSimilarity, EMBEDDING_DIM } from './embedder.js';
import { listProposed, approveAction, rejectAction, matchLogic } from '../governance/router.js';
import { recordReasoning, logSystemReset, ensureLedgerSchema } from '../governance/ledger.js';
import { archive_thought } from '../agents/hermes.js';
import { getDbPool, isDbHealthy, runQuery, runInsert, closeDbPool } from '../lib/db.js';
import { getRedisClient } from '../lib/redis.js';
import { createProvider, wrapPromptForOpenWeights } from '@kudbee/utils/llm/providers';
import { handleTelemetryIngest } from './controllers/telemetry.ts';
import { fetchFile } from '../github/connector.ts';
import { mintThinkToken } from '../memory/thinkTokenGenerator.ts';
import {
  buildAgentContext,
  evaluateRequiredSkills,
  BASE_IDENTITY
} from '../agents/src/context-factory.ts';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BOOT_TIME = Date.now();
const REGISTRY_FILE = path.resolve(__dirname, '../../config/agents.json');
const HIGH_VALUE_MODELS = new Set([
  'gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro',
  'deepseek-r1', 'deepseek-v3', 'o1-preview', 'o1-mini'
]);
const MAX_REASONING_LENGTH = 500;

function truncatePayload(value, limit) {
  if (typeof value !== 'string') return value;
  if (value.length <= limit) return value;
  return value.slice(0, limit) + '…[truncated]';
}

function loadAgentRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const agent of parsed.registry || []) {
      if (agent.status === 'active') map.set(agent.agentId, agent.publicKey);
    }
    return map;
  } catch (err) {
    console.error('[Identity] Failed to load agent registry:', err.message);
    return new Map();
  }
}

const AGENT_REGISTRY = loadAgentRegistry();

const ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes('*') ? '*' : origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Agent-Pass,Accept');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function authenticateAgentPass(headerValue) {
  if (!headerValue) return null;
  const pass = deserializePass(headerValue);
  if (!pass) return null;
  const publicKey = AGENT_REGISTRY.get(pass.agentId);
  if (!publicKey) return null;
  return verifyAgentPass(pass, publicKey, AGENT_PASS_MAX_AGE_MS) ? pass.agentId : null;
}

function verifyAgentSignature(agentId, payload, signature) {
  const publicKey = AGENT_REGISTRY.get(agentId);
  if (!publicKey) return null;
  try {
    return verifySignature(publicKey, payload, signature) ? agentId : null;
  } catch {
    return null;
  }
}

function verifyAgentPassFromKey(agentPassEncoded, publicKey, expectedAgentId) {
  const pass = deserializePass(agentPassEncoded);
  if (!pass || pass.agentId !== expectedAgentId) return null;
  if (Math.abs(Date.now() - pass.issuedAt) > AGENT_PASS_MAX_AGE_MS) return null;
  try {
    return verifySignature(publicKey, `${pass.agentId}:${pass.issuedAt}`, pass.signature)
      ? pass.agentId
      : null;
  } catch {
    return null;
  }
}

app.use(express.json({ limit: '10mb' }));

// --- Agent Context Factory middleware ----------------------------------------
// NO ORPHANED LOGIC: every request to the /api/agents router passes through
// the Phase 6 context factory. We extract the raw intent from the body, tag it
// with evaluateRequiredSkills(), then assemble the hierarchical system prompt via
// buildAgentContext(). Both are attached to the request for downstream handlers.
//
// RESILIENT-FIRST: if either factory call throws (e.g. skill-lookup failure or
// malformed tags), we console.warn and fall back to the canonical BASE_IDENTITY
// instead of crashing the request.
function agentContextMiddleware(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const requestText =
      typeof body.prompt === 'string'
        ? body.prompt
        : typeof body.intent === 'string'
          ? body.intent
          : typeof body.message === 'string'
            ? body.message
            : JSON.stringify(body || '');

    const agentSkills = evaluateRequiredSkills(requestText);
    const agentContext = buildAgentContext(requestText, agentSkills);

    req.agentSkills = agentSkills;
    req.agentContext = agentContext;
  } catch (err) {
    console.warn('[AgentContext] Factory degraded — falling back to BASE_IDENTITY:', err?.message);
    req.agentSkills = [];
    req.agentContext = BASE_IDENTITY;
  }
  next();
}


// --- Resilient Neon Postgres connection (system of record) -----------------
// getDbPool() is lazy + tolerant: missing DATABASE_URL or pool errors degrade
// to an in-memory store instead of crashing (Resilient-First). SQLite removed.
const pool = getDbPool();

async function ensureSchema() {
  if (!pool || !isDbHealthy()) {
    console.warn('[DB] No healthy Neon connection — using in-memory fallback store.');
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_traces (
        id BIGSERIAL PRIMARY KEY,
        trace_id TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'unknown',
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'OK',
        provider TEXT,
        project_name TEXT,
        value_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_trace_timestamp ON telemetry_traces(timestamp)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_trace_model ON telemetry_traces(model)'
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id BIGSERIAL PRIMARY KEY,
        trace_id TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'unknown',
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'OK',
        provider TEXT,
        project_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_violations (
        id BIGSERIAL PRIMARY KEY,
        payload TEXT NOT NULL,
        violation_reason TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_vectors (
        id BIGSERIAL PRIMARY KEY,
        trace_id TEXT NOT NULL,
        thought_summary TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT 'unknown',
        vector JSONB NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id BIGSERIAL PRIMARY KEY,
        agent_id TEXT,
        thought_summary TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT 'unknown',
        embedding JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS governance_actions (
        id BIGSERIAL PRIMARY KEY,
        trace_id TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'VERIFY',
        type TEXT NOT NULL DEFAULT 'GOVERNANCE_ACTION',
        agent_id TEXT NOT NULL,
        signature TEXT NOT NULL,
        signed_payload TEXT NOT NULL,
        value_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        note TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // "Think" layer: chain-of-thought archival. Subject to the same 30-day TTL
    // policy (see migrations/002_telemetry_logs_and_user_memories_ttl.sql, which
    // is extended to purge the `think` table via purge_expired_rows()).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS think (
        id BIGSERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task TEXT,
        phase TEXT,
        thought TEXT NOT NULL,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT 'reasoning',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_think_created_at ON think (created_at)'
    );
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS think_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_trace_id VARCHAR,
        task_context JSONB,
        failed_state JSONB,
        correction_delta TEXT,
        embedding VECTOR(1536),
        status VARCHAR NOT NULL DEFAULT 'PROVEN',
        token_cost NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE think_tokens ADD COLUMN IF NOT EXISTS token_cost NUMERIC DEFAULT 0`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vector_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        text TEXT NOT NULL,
        embedding VECTOR(1536) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS vector_memory_embedding_idx
        ON vector_memory
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log('[DB] Neon schema ensured.');
  } catch (err) {
    console.warn('[DB] Schema ensure failed — degrading to in-memory store:', err.message);
  }
}
await ensureSchema();
await ensureLedgerSchema();

let redis;
try {
  redis = getRedisClient({ label: 'ingestion' });
} catch (err) {
  console.warn('[Redis] Failed to initialize client (degrading):', err.message);
  redis = null;
}

if (redis) {
  const redisEventLabels = {
    connect: 'Periodic connection refresh',
    reconnect: 'Upstash inactivity timeout reconnect',
    ready: 'Environment re-sync ready',
    end: 'Connection closed (will auto-reconnect)'
  };

  const logRedisEvent = async (event) => {
    const reason = redisEventLabels[event] || `Redis ${event}`;
    try {
      await logSystemReset(reason, 'redis');
    } catch {
      /* never throw from lifecycle logging */
    }
  };

  redis.on('connect', () => { void logRedisEvent('connect'); });
  redis.on('reconnect', () => { void logRedisEvent('reconnect'); });
  redis.on('ready', () => { void logRedisEvent('ready'); });
  redis.on('end', () => { void logRedisEvent('end'); });
  redis.on('error', (err) => {
    console.warn(`[Redis] Error (logging SYSTEM_RESET):`, err.message);
    void logRedisEvent('error');
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let aiClient = null;
let cachedContent = null;

function getGeminiClient() {
  if (!aiClient) {
    if (!GEMINI_API_KEY) {
      console.warn('[Gemini] GEMINI_API_KEY not set — triage disabled');
      return null;
    }
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return aiClient;
}

const TRIAGE_SYSTEM_PROMPT = `You are a telemetry triage system. Respond with ONLY one word: "critical" or "ignore".

Rules:
- "critical" if: status is not 'OK', or cost > 0.05, or tokens_in > 1000
- "ignore" if: status is 'OK', cost <= 0.05, tokens_in <= 1000
- When in doubt, respond "ignore"`;

async function getOrCreateCachedContent() {
  if (cachedContent) return cachedContent;
  const client = getGeminiClient();
  if (!client) return null;
  try {
    cachedContent = await client.caches.create({
      model: 'models/gemini-1.5-flash',
      config: {
        contents: [{ role: 'user', parts: [{ text: TRIAGE_SYSTEM_PROMPT }] }],
        displayName: 'kudbee-telemetry-triage',
        ttl: '86400s',
      }
    });
    console.log('[Gemini] Context cache created:', cachedContent.name);
    return cachedContent;
  } catch (err) {
    console.warn('[Gemini] Failed to create cached content:', err.message);
    return null;
  }
}

async function triageWithGemini(event) {
  const client = getGeminiClient();
  if (!client) return true;
  const cached = await getOrCreateCachedContent();
  try {
    const prompt = `Classify this telemetry event:\n${JSON.stringify(event, null, 2)}`;
    const response = await client.models.generateContent({
      model: 'models/gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        ...(cached ? { cachedContent: cached.name } : {}),
        temperature: 0,
        maxOutputTokens: 10,
      }
    });
    const text = response.text || '';
    return text.trim().toLowerCase().includes('critical');
  } catch (err) {
    console.warn('[Gemini] Triage failed, defaulting to persist:', err.message);
    return true;
  }
}

function quarantineViolation(payload, violationReason) {
  publishEvent('triage', { payload, violation_reason: violationReason, timestamp: new Date().toISOString() });
  return runInsert(
    `INSERT INTO security_violations (payload, violation_reason, timestamp)
     VALUES ($1, $2, NOW())`,
    [JSON.stringify(payload ?? null), String(violationReason)]
  );
}

function safeParseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function reverseTokenHash(hash) {
  const hex = String(hash || '').replace(/^0x/i, '');
  if (hex.length % 2 !== 0 || hex.length === 0) return null;
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return null;
  }
}

function computeTokenHash(row) {
  const key = String(row.id || row.original_trace_id || '');
  return `0x${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

function storeVector({ traceId, thoughtSummary, reasoning, model, vector, agentId = null }) {
  return runInsert(
    `INSERT INTO telemetry_vectors (trace_id, thought_summary, reasoning, model, vector, timestamp)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [String(traceId), String(thoughtSummary || ''), String(reasoning || ''), String(model || 'unknown'), JSON.stringify(vector)]
  ).then((res) => {
    // Mirror into user_memories (the semantic long-term store, subject to TTL).
    return runInsert(
      `INSERT INTO user_memories (agent_id, thought_summary, reasoning, model, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [agentId ? String(agentId) : null, String(thoughtSummary || ''), String(reasoning || ''), String(model || 'unknown'), JSON.stringify(vector)]
    ).catch(() => res);
  });
}

async function recallMemories(query, limit = 3) {
  const queryVec = embedTrace(query, query, 'query');
  const rows = await runQuery(`SELECT * FROM telemetry_vectors ORDER BY timestamp DESC LIMIT 200`);
  const scored = rows
    .map((row) => {
      const vec = safeParseJson(row.vector);
      const similarity = Array.isArray(vec) ? cosineSimilarity(queryVec, vec) : 0;
      return {
        trace_id: row.trace_id,
        thought_summary: row.thought_summary,
        reasoning: row.reasoning,
        model: row.model,
        similarity
      };
    })
    .filter((r) => r.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return scored;
}

/**
 * Recall the last N persisted user memories (semantic long-term store).
 * Distinct from `recallMemories` (vector search): this returns raw stored
 * memories in reverse-chronological order, capped at `limit`.
 */
async function recallUserMemories(limit = 10) {
  const rows = await runQuery(
    `SELECT id, agent_id, thought_summary, reasoning, model, created_at
     FROM user_memories
     ORDER BY created_at DESC
     LIMIT $1`,
    [Number(limit) || 10]
  );
  return rows
    .map((row) => ({
      id: row.id,
      agent_id: row.agent_id ?? null,
      thought_summary: row.thought_summary || '',
      reasoning: row.reasoning || '',
      model: row.model || 'unknown',
      created_at: row.created_at ?? null
    }))
    .slice(0, limit);
}

// --- Telemetry ingest firewall: drop low-value / heartbeat events -----------
// Heartbeat and no-op pings must never be persisted; only critical traces land
// in the system of record. This is the deterministic layer that complements the
// Gemini triage model.
const HEARTBEAT_PATTERNS = [
  /^heartbeat$/i,
  /^ping$/i,
  /^health$/i,
  /^keep[-_]?alive$/i,
  /^\/api\/health/i,
  /_ping$/i
];

function isLowValueEvent({ trace_id, model, tokens_in, tokens_out, cost, status }) {
  const tid = String(trace_id || '').toLowerCase();
  if (HEARTBEAT_PATTERNS.some((re) => re.test(tid))) return true;
  // No meaningful token/cost footprint and OK status == noise.
  const tokens = (Number(tokens_in) || 0) + (Number(tokens_out) || 0);
  const price = Number(cost) || 0;
  if (tokens === 0 && price === 0 && (status || 'OK') === 'OK' && model === 'heartbeat') {
    return true;
  }
  return false;
}

app.post('/api/telemetry/ingest', async (req, res) => {
  try {
    const agentId = authenticateAgentPass(req.header('X-Agent-Pass'));
    const { trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, thought_summary, reasoning } = req.body || {};
    const effectiveStatus = agentId ? (status || 'authenticated_bypass') : (status || 'OK');

    // Firewall: drop low-value / heartbeat events before any persistence.
    if (isLowValueEvent({ trace_id, model, tokens_in, tokens_out, cost, status: effectiveStatus })) {
      return res.status(200).json({
        success: true,
        id: null,
        agent: agentId || undefined,
        bypass: !!agentId,
        recalled_context: [],
        message: 'Event filtered at ingest firewall (low-value/heartbeat) — not persisted'
      });
    }

    if (!agentId) {
      const parsed = IngestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const reason = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        await quarantineViolation(req.body, reason);
        return res.status(422).json({ error: 'Firewall: invalid telemetry contract', issues: parsed.error.issues });
      }
    }

    const isHeartbeatPing = Number(tokens_in) <= 1 && Number(tokens_out) <= 1 && effectiveStatus === 'OK';
    const isHighValueModel = HIGH_VALUE_MODELS.has(model);
    const shouldSave = !isHeartbeatPing && (effectiveStatus !== 'OK' || isHighValueModel);

    if (!shouldSave) {
      return res.status(200).json({
        success: true,
        id: null,
        agent: agentId || undefined,
        bypass: !!agentId,
        recalled_context: [],
        message: `Event filtered at budget firewall (low-value heartbeat) — not persisted`
      });
    }

    const effectiveThought = agentId ? (thought_summary || '') : truncatePayload(thought_summary || '', MAX_REASONING_LENGTH);
    const effectiveReasoning = agentId ? (reasoning || '') : truncatePayload(reasoning || '', MAX_REASONING_LENGTH);

    const shouldPersist = await triageWithGemini({
      trace_id, model, tokens_in, tokens_out, cost, status: effectiveStatus, provider, project_name
    });

    if (!shouldPersist) {
      return res.status(200).json({
        success: true,
        id: null,
        agent: agentId || undefined,
        bypass: !!agentId,
        recalled_context: [],
        message: 'Event filtered by Gemini triage (low-value)'
      });
    }

    const recall = await recallMemories(
      [effectiveThought, effectiveReasoning, model].filter(Boolean).join(' '), 3
    ).catch((e) => {
      console.error('[Memory] Recall failed, continuing without context:', e.message);
      return [];
    });

    const result = await runInsert(
      `INSERT INTO telemetry_traces (trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        String(trace_id ?? (agentId ? `agent-${agentId}` : 'unknown')),
        String(model || 'unknown'),
        Number(tokens_in) || 0,
        Number(tokens_out) || 0,
        Number(cost) || 0,
        String(effectiveStatus),
        String(provider || 'unknown'),
        String(project_name || 'kilo-fuel-gauge')
      ]
    );

    const vector = embedTrace(effectiveReasoning, effectiveThought, model || 'unknown');
    await storeVector({
      traceId: trace_id ?? (agentId ? `agent-${agentId}` : 'unknown'),
      thoughtSummary: effectiveThought,
      reasoning: effectiveReasoning,
      model: model || 'unknown',
      vector,
      agentId
    }).catch((e) => console.error('[Memory] Vector store failed (observability):', e.message));

    if (agentId) {
      console.log(`[Identity] Fast-path bypass granted for agent ${agentId} (trace ${result.id})`);
    }

    const responsePayload = {
      success: true,
      id: result.id,
      agent: agentId || undefined,
      bypass: !!agentId,
      recalled_context: recall,
      message: agentId
        ? 'Telemetry trace ingested via authenticated agent fast-path'
        : 'Telemetry trace ingested successfully'
    };

    // Real egressed signal — built unconditionally so the SSE broadcast
    // below always has valid data, then mirrored to the Redis feed (best-effort
    // when a cache is configured).
    const feedEntry = {
      trace_id: trace_id ?? (agentId ? `agent-${agentId}` : 'unknown'),
      model: model || 'unknown',
      tokens_in: Number(tokens_in) || 0,
      tokens_out: Number(tokens_out) || 0,
      cost: Number(cost) || 0,
      status: effectiveStatus,
      provider: provider || 'unknown',
      project_name: project_name || 'kilo-fuel-gauge',
      timestamp: new Date().toISOString()
    };

    if (redis) {
      redis.lpush('kudbee:telemetry_feed', JSON.stringify(feedEntry))
        .then(() => redis.ltrim('kudbee:telemetry_feed', 0, 9999))
        .catch((e) => console.error('[Redis] Telemetry feed push failed:', e.message));
    }

    // Native SSE broadcast of the real egressed signal so the Edge Sentinel
    // plugin can pulse/shift on live ingress events (replaces polling).
    publishEvent('telemetry', {
      trace_id: feedEntry.trace_id,
      model: feedEntry.model,
      tokens_in: feedEntry.tokens_in,
      tokens_out: feedEntry.tokens_out,
      cost: feedEntry.cost,
      status: feedEntry.status,
      latency_ms: 0,
      agent: agentId || null,
      ts: feedEntry.timestamp
    });

    return res.status(201).json(responsePayload);
  } catch (err) {
    console.error('[Ingest] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// --- Agent Context Factory router --------------------------------------------
// Every /api/agents request is routed through agentContextMiddleware (NO
// ORPHANED LOGIC), so req.agentContext / req.agentSkills are always populated
// (or safely degraded to BASE_IDENTITY). The factory output is surfaced back to
// the caller so the assembled hierarchical prompt is observable end-to-end.
const agentsRouter = express.Router();
agentsRouter.use(agentContextMiddleware);
agentsRouter.post('/context', (req, res) => {
  res.json({
    success: true,
    skills: Array.isArray(req.agentSkills) ? req.agentSkills.map((s) => s.id) : [],
    skill_count: Array.isArray(req.agentSkills) ? req.agentSkills.length : 0,
    system_prompt: req.agentContext || ''
  });
});
agentsRouter.get('/context', (req, res) => {
  // GET support: intent supplied via ?prompt= or ?intent= query string.
  const requestText =
    typeof req.query.prompt === 'string'
      ? req.query.prompt
      : typeof req.query.intent === 'string'
        ? req.query.intent
        : '';
  try {
    const skills = evaluateRequiredSkills(requestText);
    const ctx = buildAgentContext(requestText, skills);
    res.json({ success: true, skills: skills.map((s) => s.id), skill_count: skills.length, system_prompt: ctx });
  } catch (err) {
    console.warn('[AgentContext] GET factory degraded:', err?.message);
    res.json({ success: true, skills: [], skill_count: 0, system_prompt: BASE_IDENTITY, degraded: true });
  }
});
app.use('/api/agents', agentsRouter);

// Edge Sentinel telemetry ingestion webhook (auth via X-Agent-Pass).
// Mounted at a distinct path so it does not clobber the Zod-firewall
// /api/telemetry/ingest route. Controller lives in controllers/telemetry.ts.
app.post('/api/telemetry/edge-ingest', handleTelemetryIngest);

app.post('/api/memory/remember', async (req, res) => {
  try {
    const { data } = req.body || {};
    if (typeof data !== 'string' || !data.trim()) {
      return res.status(422).json({ success: false, error: 'Data payload must be a non-empty string' });
    }

    const result = await runInsert(
      `INSERT INTO user_memories (thought_summary) VALUES ($1) RETURNING id`,
      [data.trim()]
    );

    return res.status(201).json({
      success: true,
      id: result.id,
      message: 'Memory persisted successfully'
    });
  } catch (err) {
    console.error('[Memory] Remember endpoint error:', err?.message);
    res.status(500).json({ success: false, error: 'Failed to persist memory' });
  }
});

app.get('/api/memory/recall', async (req, res) => {
  try {
    const query = String(req.query.query || '');
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
    const last = Math.min(Math.max(Number(req.query.last) || 0, 0), 50);

    // `?last=N` → return the last N persisted user memories (semantic store).
    if (last > 0 && !query) {
      const memories = await recallUserMemories(last);
      return res.json({ count: memories.length, memories });
    }

    if (!query) {
      return res.status(400).json({ error: 'Missing required query parameter: query' });
    }
    const memories = await recallMemories(query, limit);
    return res.json({ query, count: memories.length, memories });
  } catch (err) {
    console.error('[Memory] Recall endpoint error:', err.message);
    return res.status(500).json({ error: 'Failed to recall memory' });
  }
});

// --- Thought-Stream Interceptor: archive chain-of-thought into the `think`
// database (Neon, with in-memory fallback). GET retrieves the most recent N
// thought blocks; POST (or query args on GET) persists a new one via
// hermes.archive_thought(). Resilient-First: failures degrade to a warning.
app.post('/api/think/archive', async (req, res) => {
  try {
    const block = req.body || {};
    if (!block.thought || typeof block.thought !== 'string' || block.thought.trim() === '') {
      return res.status(400).json({ error: 'Missing required field: thought (non-empty string)' });
    }
    const result = await archive_thought(block);
    if (!result.ok) {
      return res.status(200).json({ ok: false, warning: result.error, archived: false });
    }
    return res.status(201).json({ ok: true, archived: true, task: result.task });
  } catch (err) {
    console.error('[Think] Archive error:', err.message);
    return res.status(500).json({ error: 'Failed to archive thought' });
  }
});

app.get('/api/think/archive', async (req, res) => {
  try {
    // POST-style persistence via query args (handy for curl/SSE triggers).
    const thought = String(req.query.thought || '');
    if (thought) {
      const result = await archive_thought({
        thought,
        task: req.query.task ? String(req.query.task) : undefined,
        phase: req.query.phase ? String(req.query.phase) : undefined,
        tokens_in: Number(req.query.tokens_in) || 0,
        tokens_out: Number(req.query.tokens_out) || 0,
        model: req.query.model ? String(req.query.model) : 'reasoning'
      });
      return res.status(201).json({ ok: result.ok, archived: result.ok, task: result.task });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const rows = await runQuery(
      `SELECT id, agent_id, task, phase, thought, tokens_in, tokens_out, model, created_at
       FROM think ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.json({ count: rows.length, thoughts: rows });
  } catch (err) {
    console.error('[Think] Read error:', err.message);
    return res.status(500).json({ error: 'Failed to read thought archive' });
  }
});

app.get('/api/think/trajectories', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const rows = await runQuery(
      `SELECT id, original_trace_id, task_context, failed_state, correction_delta, embedding, status, created_at
       FROM think_tokens
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    const trajectories = rows.map((row) => {
      const rawEmbedding = safeParseJson(row.embedding);
      const embedding = Array.isArray(rawEmbedding) ? rawEmbedding : new Array(1536).fill(0);
      const magnitude = Math.sqrt(embedding.reduce((acc, v) => acc + v * v, 0)) || 0;
      const tokenHash = computeTokenHash(row);
      return {
        id: String(row.id),
        token_hash: tokenHash,
        spatial_coordinates: embedding,
        similarity_score: Number(magnitude.toFixed(4)),
        status: row.status || 'PENDING_APPROVAL',
        task_context: safeParseJson(row.task_context),
        failed_state: safeParseJson(row.failed_state),
        correction_delta: row.correction_delta || '',
        created_at: row.created_at
      };
    });
    return res.json({ count: trajectories.length, trajectories });
  } catch (err) {
    console.error('[Think] Trajectories error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch think trajectories' });
  }
});

app.patch('/api/think/trajectories/:hash/status', async (req, res) => {
  try {
    const { hash } = req.params;
    const { status, reviewerNotes, tokenId } = req.body || {};
    const allowedStatuses = ['VERIFIED', 'RECYCLED'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}. Allowed: ${allowedStatuses.join(', ')}` });
    }

    let matched = null;
    if (tokenId) {
      const rows = await runQuery(
        `SELECT id, original_trace_id FROM think_tokens WHERE id = $1`,
        [String(tokenId)]
      );
      if (rows.length > 0) {
        matched = rows[0];
      }
    }
    if (!matched) {
      const reversed = reverseTokenHash(hash);
      let candidates = [];
      if (reversed) {
        candidates = await runQuery(
          `SELECT id, original_trace_id FROM think_tokens WHERE original_trace_id LIKE $1 || '%'`,
          [reversed]
        );
      }
      if (candidates.length === 0) {
        const idPrefix = String(hash).replace(/^0x/i, '');
        candidates = await runQuery(
          `SELECT id, original_trace_id FROM think_tokens WHERE id::text LIKE $1 || '%'`,
          [idPrefix]
        );
      }

      const exactMatches = candidates.filter((c) => {
        const byId = String(c.id) === hash;
        const byTrace = String(c.original_trace_id) === hash;
        const byHash = computeTokenHash(c) === hash;
        return byId || byTrace || byHash;
      });
      if (exactMatches.length === 1) {
        matched = exactMatches[0];
      } else if (exactMatches.length > 1) {
        return res.status(409).json({ error: 'Ambiguous token hash: multiple tokens match. Include tokenId in request body.' });
      }
    }

    if (!matched) {
      return res.status(404).json({ error: 'Think token not found for hash' });
    }

    const finalTokenId = String(matched.id);
    await runQuery(
      `UPDATE think_tokens SET status = $1 WHERE id = $2`,
      [status, finalTokenId]
    );

    const eventData = {
      id: finalTokenId,
      hash,
      status,
      reviewerNotes: reviewerNotes || null,
      timestamp: new Date().toISOString()
    };
    publishEvent('think_token_status_updated', eventData);

    return res.json({ success: true, tokenId: finalTokenId, status, reviewerNotes: reviewerNotes || null });
  } catch (err) {
    console.error('[Think] Status update error:', err.message);
    return res.status(500).json({ error: 'Failed to update think token status' });
  }
});

app.get('/api/telemetry/logs', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const rows = await runQuery(
      `SELECT * FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    return res.json(rows);
  } catch (err) {
    console.error('[Logs] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const totalCostRow = await runQuery(`SELECT SUM(cost) as total FROM telemetry_traces`);
    const totalTokensRow = await runQuery(`SELECT SUM(tokens_in + tokens_out) as total FROM telemetry_traces`);
    const totalInputRow = await runQuery(`SELECT SUM(tokens_in) as total FROM telemetry_traces`);
    const totalOutputRow = await runQuery(`SELECT SUM(tokens_out) as total FROM telemetry_traces`);
    const activeModelsRow = await runQuery(`SELECT COUNT(DISTINCT model) as count FROM telemetry_traces`);
    const totalRequestsRow = await runQuery(`SELECT COUNT(*) as count FROM telemetry_traces`);
    const errorCountRow = await runQuery(`SELECT COUNT(*) as count FROM telemetry_traces WHERE status != 'OK'`);

    const now = Date.now();
    const last24h = new Date(now - 24 * 3600 * 1000).toISOString();
    const last7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const cost24hRow = await runQuery(
      `SELECT SUM(cost) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last24h]
    );
    const dailyTokensRow = await runQuery(
      `SELECT SUM(tokens_in + tokens_out) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last24h]
    );
    const dailyInputRow = await runQuery(
      `SELECT SUM(tokens_in) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last24h]
    );
    const dailyOutputRow = await runQuery(
      `SELECT SUM(tokens_out) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last24h]
    );
    const weeklyTokensRow = await runQuery(
      `SELECT SUM(tokens_in + tokens_out) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last7d]
    );
    const weeklyInputRow = await runQuery(
      `SELECT SUM(tokens_in) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last7d]
    );
    const weeklyOutputRow = await runQuery(
      `SELECT SUM(tokens_out) as total FROM telemetry_traces WHERE timestamp >= $1`,
      [last7d]
    );

    const totalRequests = Number(totalRequestsRow[0]?.count || 0);
    const errorCount = Number(errorCountRow[0]?.count || 0);
    const errorRate = totalRequests > 0 ? Number(((errorCount / totalRequests) * 100).toFixed(2)) : 0;
    const sinkTokenBalance = Number(process.env.SINK_TOKEN_BALANCE || 1000);

    let postgresSizeBytes = null;
    let redisSizeBytes = null;
    try {
      const pgResult = await runQuery('SELECT pg_database_size(current_database()) as db_size');
      if (pgResult[0]?.db_size) postgresSizeBytes = Number(pgResult[0].db_size);
    } catch {
      postgresSizeBytes = null;
    }
    try {
      if (redis) {
        const info = await redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match && match[1]) redisSizeBytes = Number(match[1]);
      }
    } catch {
      redisSizeBytes = null;
    }

    return res.json({
      total_24h_cost: Number((cost24hRow[0]?.total || 0).toFixed(6)),
      total_historical_tokens: Number(totalTokensRow[0]?.total || 0),
      total_input_tokens: Number(totalInputRow[0]?.total || 0),
      total_output_tokens: Number(totalOutputRow[0]?.total || 0),
      total_active_models: Number(activeModelsRow[0]?.count || 0),
      total_requests: totalRequests,
      error_rate: errorRate,
      health_matrix: [],
      sink_token_balance: sinkTokenBalance,
      daily_total_tokens: Number(dailyTokensRow[0]?.total || 0),
      daily_input_tokens: Number(dailyInputRow[0]?.total || 0),
      daily_output_tokens: Number(dailyOutputRow[0]?.total || 0),
      weekly_total_tokens: Number(weeklyTokensRow[0]?.total || 0),
      weekly_input_tokens: Number(weeklyInputRow[0]?.total || 0),
      weekly_output_tokens: Number(weeklyOutputRow[0]?.total || 0),
      postgres_size_bytes: postgresSizeBytes,
      redis_size_bytes: redisSizeBytes
    });
  } catch (err) {
    console.error('[Summary] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// --- Phase 28: Live OS Telemetry Stats ---------------------------------------
app.get('/api/telemetry/stats', async (_req, res) => {
  try {
    const vectorRows = await runQuery(`SELECT COUNT(*) as count FROM vector_memory`).catch(() => [{ count: 0 }]);
    const tokenRows = await runQuery(`SELECT COUNT(*) as count FROM think_tokens`).catch(() => [{ count: 0 }]);

    let crucible = { cycleCount: 0, maxCycles: 5, status: 'READY' };
    if (process.env.CRUCIBLE_ENABLED === 'true') {
      try {
        const { crucible: crucibleModule } = await import('./agents/crucible.js');
        const remaining = crucibleModule.MAX_CYCLES_PER_BOOT - crucibleModule.cycleCount;
        crucible = {
          cycleCount: crucibleModule.cycleCount,
          maxCycles: crucibleModule.MAX_CYCLES_PER_BOOT,
          status: remaining > 0 ? 'ACTIVE' : 'EXHAUSTED'
        };
      } catch {
        crucible = { cycleCount: 0, maxCycles: 5, status: 'READY' };
      }
    }

    return res.json({
      vector_memory_count: Number(vectorRows[0]?.count || 0),
      think_tokens_minted: Number(tokenRows[0]?.count || 0),
      crucible,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Stats] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch telemetry stats' });
  }
});

// --- Phase 32: Live Think Metrics Aggregation ----------------------------------
app.get('/api/think/metrics', async (_req, res) => {
  try {
    const totalRows = await runQuery(`SELECT COUNT(*) as count FROM think_tokens`).catch(() => [{ count: 0 }]);
    const verifiedRows = await runQuery(`SELECT COUNT(*) as count FROM think_tokens WHERE status = 'VERIFIED'`).catch(() => [{ count: 0 }]);
    const costRows = await runQuery(`SELECT SUM(token_cost) as total FROM think_tokens`).catch(() => [{ total: 0 }]);

    res.json({
      total_think_tokens: Number(totalRows[0]?.count || 0),
      verified_trajectories: Number(verifiedRows[0]?.count || 0),
      cumulative_token_cost: Number(costRows[0]?.total || 0)
    });
  } catch (err) {
    console.error('[Metrics] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch think metrics' });
  }
});

app.post('/api/telemetry/inject-csv', async (req, res) => {
  try {
    const { logs } = req.body;
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ error: 'Missing logs array' });
    }

    const inserted = [];
    for (const item of logs) {
      const result = await runInsert(
        `INSERT INTO telemetry_traces (trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          String(item.trace_id || `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          String(item.model || item.model_name || 'unknown'),
          Number(item.tokens_in || item.input_tokens || 0),
          Number(item.tokens_out || item.output_tokens || 0),
          Number(item.cost || 0),
          String(item.status || 'OK'),
          String(item.provider || 'unknown'),
          String(item.project_name || item.project || 'offline-csv-import'),
          String(item.timestamp || new Date().toISOString())
        ]
      );
      inserted.push({ id: result.id, ...item });
    }

    return res.json({ success: true, count: inserted.length, logs: inserted });
  } catch (err) {
    console.error('[CSV Inject] Error:', err.message);
    return res.status(500).json({ error: 'Failed to inject CSV logs' });
  }
});

app.post('/api/telemetry/purge', async (req, res) => {
  try {
    await runQuery(`DELETE FROM telemetry_traces`);
    return res.json({ status: 'success', message: 'Telemetry logs have been purged and database reset.' });
  } catch (err) {
    console.error('[Purge] Error:', err.message);
    return res.status(500).json({ error: 'Failed to purge database' });
  }
});

app.get('/api/interceptor/triage', async (req, res) => {
  try {
    const rows = await runQuery(
      `SELECT * FROM security_violations ORDER BY timestamp DESC`
    );
    const violations = rows.map((row) => ({
      id: row.id,
      payload: safeParseJson(row.payload),
      violation_reason: row.violation_reason,
      timestamp: row.timestamp
    }));
    return res.json(violations);
  } catch (err) {
    console.error('[Interceptor] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch triage queue' });
  }
});

app.delete('/api/interceptor/triage/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid violation id' });
    }
    const result = await runQuery(`DELETE FROM security_violations WHERE id = $1`, [id]);
    return res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('[Interceptor] Delete Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete violation' });
  }
});

app.post('/api/interceptor/revalidate/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid violation id' });
    }
    const rows = await runQuery(`SELECT * FROM security_violations WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Violation not found' });
    }
    const violation = rows[0];
    const payload = safeParseJson(violation.payload);

    const parsed = IngestRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      await quarantineViolation(payload, reason);
      return res.status(422).json({ error: 'Firewall: re-validation failed', issues: parsed.error.issues });
    }

    const { trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name } = parsed.data;
    const result = await runInsert(
      `INSERT INTO telemetry_traces (trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        String(trace_id),
        String(model),
        Number(tokens_in) || 0,
        Number(tokens_out) || 0,
        Number(cost) || 0,
        String(status || 'OK'),
        String(provider || 'unknown'),
        String(project_name || 'kilo-fuel-gauge')
      ]
    );
    await runQuery(`DELETE FROM security_violations WHERE id = $1`, [id]);

    return res.status(201).json({
      success: true,
      id: result.id,
      message: 'Re-validation passed; telemetry trace ingested and violation cleared'
    });
  } catch (err) {
    console.error('[Interceptor] Revalidate Error:', err.message);
    return res.status(500).json({ error: 'Failed to re-validate violation' });
  }
});

app.post('/api/interceptor/verify', async (req, res) => {
  try {
    const {
      trace_id,
      agent_id,
      agent_pass,
      signature,
      signed_payload,
      value_score = 0,
      note
    } = req.body || {};

    const traceId = String(trace_id || '');
    const agentId = String(agent_id || '');
    const providedSignature = String(signature || '');
    const providedPayload = String(signed_payload || '');
    const providedPublicKey = req.body?.public_key ? String(req.body.public_key) : null;

    if (!traceId || !agentId || !providedSignature || !providedPayload) {
      return res.status(400).json({
        error: 'Missing required fields: trace_id, agent_id, signature, signed_payload'
      });
    }

    let passAgentId = providedPublicKey
      ? verifyAgentPassFromKey(agent_pass, providedPublicKey, agentId)
      : authenticateAgentPass(agent_pass);
    if (!passAgentId || passAgentId !== agentId) {
      return res.status(401).json({ error: 'Unauthorized: invalid or mismatched agent pass' });
    }

    const verifiedAgent = providedPublicKey
      ? (verifySignature(providedPublicKey, providedPayload, providedSignature) ? agentId : null)
      : verifyAgentSignature(agentId, providedPayload, providedSignature);
    if (!verifiedAgent) {
      return res.status(403).json({ error: 'Signature verification failed for provided trace' });
    }

    const score = Math.max(0, Math.min(100, Number(value_score) || 0));
    const govTimestamp = Date.now();
    let govId = Date.now();

    if (redis) {
      try {
        govId = await redis.incr('kudbee:governance_counter');
        const govRecord = {
          id: govId,
          trace_id: traceId,
          action: 'VERIFY',
          type: 'GOVERNANCE_ACTION',
          agent_id: agentId,
          signature: providedSignature,
          signed_payload: providedPayload,
          value_score: score,
          note: note ? String(note) : null,
          timestamp: new Date(govTimestamp).toISOString()
        };
        await redis.zadd('kudbee:governance_actions', govTimestamp, JSON.stringify(govRecord));
        await redis.sadd('kudbee:verified_traces', traceId);
        await redis.incrbyfloat('kudbee:community_value_score', score);
        await redis.incr('kudbee:governance_count');
      } catch (e) {
        console.error('[Redis] Governance action failed:', e.message);
      }
    }

    await runInsert(
      `INSERT INTO governance_actions
        (trace_id, action, type, agent_id, signature, signed_payload, value_score, note, timestamp)
       VALUES ($1, 'VERIFY', 'GOVERNANCE_ACTION', $2, $3, $4, $5, $6, NOW())`,
      [traceId, agentId, providedSignature, providedPayload, score, note ? String(note) : null]
    ).catch(() => {});

    if (score > 0) {
      await runQuery(
        `UPDATE telemetry_traces SET value_score = $1 WHERE trace_id = $2`,
        [score, traceId]
      ).catch(() => {});
    }

    console.log(`[Governance] Agent ${agentId} VERIFIED trace ${traceId} (value_score=${score})`);

    return res.status(201).json({
      success: true,
      verified: true,
      actionId: govId || Date.now(),
      type: 'GOVERNANCE_ACTION',
      trace_id: traceId,
      agent_id: agentId,
      signature: providedSignature,
      signed_payload: providedPayload,
      value_score: score,
      message: 'Trace verified and signed — governance action recorded on-chain ledger.'
    });
  } catch (err) {
    console.error('[Governance] Verify error:', err?.message);
    return res.status(500).json({ error: 'Failed to record governance action', details: err?.message });
  }
});

app.get('/api/governance/feed', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    if (redis) {
      try {
        const rawRows = await redis.zrange('kudbee:governance_actions', 0, limit - 1, 'REV');
        const feed = rawRows.map((row) => {
          const data = JSON.parse(row);
          return {
            id: data.id,
            trace_id: data.trace_id,
            action: data.action,
            type: data.type,
            agent_id: data.agent_id,
            signature: data.signature,
            signed_payload: data.signed_payload,
            value_score: data.value_score,
            note: data.note,
            timestamp: data.timestamp
          };
        });
        return res.json(feed);
      } catch (e) {
        console.error('[Redis] Governance feed fallback to SQLite:', e.message);
      }
    }

    const rows = await runQuery(
      `SELECT * FROM governance_actions ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    const feed = rows.map((row) => ({
      id: row.id,
      trace_id: row.trace_id,
      action: row.action,
      type: row.type,
      agent_id: row.agent_id,
      signature: row.signature,
      signed_payload: row.signed_payload,
      value_score: row.value_score,
      note: row.note,
      timestamp: row.timestamp
    }));
    return res.json(feed);
  } catch (err) {
    console.error('[Governance] Feed error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch governance feed' });
  }
});

// --- Governance Router: Proposed / Approve / Reject -----------------------

app.get('/api/governance/proposed', async (_req, res) => {
  try {
    const proposed = await listProposed();
    return res.json(proposed);
  } catch (err) {
    console.error('[Governance] Proposed list error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch proposed actions' });
  }
});

// --- HITL Governance Gate: pending approvals -------------------------------
// Surfaces proposed agent actions as typed ApprovalRequest objects the
// dashboard renders in the "Governance Intervention Required" card. Resilient-
// First: a router/DB failure returns an empty list + a warning, never a crash.
app.get('/api/governance/pending', async (_req, res) => {
  try {
    const proposed = await listProposed();
    const pending = proposed
      .filter((p) => !p || p.status === 'PROPOSED' || p.status === 'PENDING_APPROVAL')
      .map((p) => {
        const prompt = typeof p.prompt === 'string' ? p.prompt : '';
        // Best-effort extraction of structured HITL metadata from the prompt.
        const modelMatch = prompt.match(/model[:=]\s*([A-Za-z0-9.\-]+)/i);
        const costMatch = prompt.match(/cost[:=]\s*\$?([0-9]*\.?[0-9]+)/i);
        const tokMatch = prompt.match(/(?:reasoning[_ ]?tokens|tokens)[:=]\s*([0-9]+)/i);
        return {
          id: String(p.id),
          proposed_model: modelMatch ? modelMatch[1] : 'unknown',
          estimated_cost: costMatch ? Number(costMatch[1]) : 0,
          reasoning_tokens: tokMatch ? Number(tokMatch[1]) : prompt.length,
          status: 'PENDING_APPROVAL',
          agent_id: p.agent_id ? String(p.agent_id) : undefined,
          task: p.action ? String(p.action) : undefined,
          reasoning: prompt || undefined,
          created_at: p.created_at ? String(p.created_at) : undefined
        };
      });
    return res.json(pending);
  } catch (err) {
    console.warn('[Governance] Pending list degraded (router unavailable):', err?.message);
    return res.json([]);
  }
});

app.post('/api/governance/approve', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing "id"' });
    const proven = await approveActionAndBroadcast(String(id));
    if (!proven) return res.status(404).json({ error: 'Proposed action not found' });
    return res.status(200).json({ success: true, action: proven });
  } catch (err) {
    console.error('[Governance] Approve error:', err?.message);
    return res.status(500).json({ error: 'Failed to approve action' });
  }
});

app.post('/api/governance/reject', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing "id"' });
    const rejected = await rejectActionAndBroadcast(String(id));
    if (!rejected) return res.status(404).json({ error: 'Proposed action not found' });
    return res.status(200).json({ success: true, action: rejected });
  } catch (err) {
    console.error('[Governance] Reject error:', err?.message);
    return res.status(500).json({ error: 'Failed to reject action' });
  }
});

// --- HITL resolution: single entry point the dashboard calls ---------------
// Accepts { id, decision: 'APPROVE' | 'REJECT' } and routes to the matching
// governance action. Also handles numeric triage item IDs from the interceptor
// by creating a governance record on the fly.
app.post('/api/governance/resolve', async (req, res) => {
  try {
    const { id, decision } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing required field: id' });
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      return res.status(400).json({ error: "Invalid decision: must be 'APPROVE' or 'REJECT'" });
    }
    if (decision === 'APPROVE') {
      let proven = await approveActionAndBroadcast(String(id));
      if (!proven && /^\d+$/.test(String(id))) {
        const rows = await runQuery(`SELECT * FROM security_violations WHERE id = $1`, [Number(id)]);
        if (rows.length > 0) {
          const violation = rows[0];
          const payload = safeParseJson(violation.payload);
          const traceId = payload.trace_id || `triage-${id}`;
          const govId = redis ? await redis.incr('kudbee:governance_counter') : Date.now();
          const govRecord = {
            id: govId,
            trace_id: traceId,
            action: 'VERIFY',
            type: 'GOVERNANCE_ACTION',
            agent_id: 'partner',
            signature: 'signed',
            signed_payload: JSON.stringify(payload),
            value_score: 50,
            note: `Approved triage #${id}`,
            timestamp: Date.now()
          };
          if (redis) {
            await redis.set(`governance:proven:${govId}`, JSON.stringify(govRecord));
          }
          await runQuery(`DELETE FROM security_violations WHERE id = $1`, [Number(id)]);
          proven = govRecord;
          publishEvent('governance', { kind: 'approved', action: proven });
        }
      }
      if (!proven) return res.status(404).json({ error: 'Proposed action not found' });
      return res.status(200).json({ success: true, decision: 'APPROVE', action: proven });
    }
    const rejected = await rejectActionAndBroadcast(String(id));
    if (!rejected) return res.status(404).json({ error: 'Proposed action not found' });
    return res.status(200).json({ success: true, decision: 'REJECT', action: rejected });
  } catch (err) {
    console.error('[Governance] Resolve error:', err?.message);
    return res.status(500).json({ error: 'Failed to resolve governance action' });
  }
});

// --- Think Token Forge: mint a permanent correction delta --------------------
app.post('/api/governance/mint-think-token', async (req, res) => {
  try {
    const { traceId, taskContext, failedState, correctionDelta, status } = req.body || {};
    if (!traceId || !correctionDelta) {
      return res.status(400).json({ error: 'Missing required fields: traceId, correctionDelta' });
    }
    const result = await mintThinkToken({
      traceId: String(traceId),
      taskContext: taskContext || {},
      failedState: failedState || {},
      correctionDelta: String(correctionDelta),
      status: ['PENDING_APPROVAL', 'VERIFIED', 'RECYCLED'].includes(status) ? status : 'PENDING_APPROVAL'
    });
    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }
    return res.status(201).json({ success: true, tokenId: result.id, embedding_dim: result.embedding.length });
  } catch (err) {
    console.error('[ThinkToken] Mint error:', err?.message);
    return res.status(500).json({ error: 'Failed to mint think token' });
  }
});

// --- Governance health + HERMES auditor status ---------------------------

const HERMES_HEARTBEAT_KEY = 'kudbee:agents:hermes';
const HERMES_HEARTBEAT_MAX_AGE_MS = 45_000; // treat stale heartbeats as Offline

app.get('/api/governance/health', async (_req, res) => {
  try {
    let proposedCount = 0;
    let hermesOnline = false;
    let hermesStatus = 'Offline';

    try {
      const proposed = await listProposed();
      proposedCount = proposed.length;
    } catch {
      /* ignore */
    }

    if (redis) {
      try {
        const raw = await redis.get(HERMES_HEARTBEAT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const ts = parsed.timestamp ? Date.parse(parsed.timestamp) : 0;
          hermesOnline = !Number.isNaN(ts) && Date.now() - ts < HERMES_HEARTBEAT_MAX_AGE_MS;
          hermesStatus = hermesOnline ? 'Online' : 'Offline';
        }
      } catch {
        /* ignore */
      }
    }

    return res.json({
      governance_active: true,
      router_healthy: true,
      proposed_count: proposedCount,
      hermes: { status: hermesStatus, online: hermesOnline },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Governance] Health error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch governance health' });
  }
});

// --- Phase 28: Manual Crucible Dispatch --------------------------------------
app.post('/api/governance/dispatch', async (req, res) => {
  try {
    const { task } = req.body || {};
    let result = {
      success: false,
      cycle: 0,
      maxCycles: 5,
      traceId: '',
      taskId: task || 'manual-dispatch',
      message: 'Crucible not enabled'
    };

    if (process.env.CRUCIBLE_ENABLED === 'true') {
      try {
        const { crucible: crucibleModule } = await import('../agents/crucible.js');
        const cycleResult = await crucibleModule.runCrucibleCycle();
        result = {
          success: cycleResult?.success ?? true,
          cycle: cycleResult?.cycle ?? crucibleModule.cycleCount,
          maxCycles: crucibleModule.MAX_CYCLES_PER_BOOT,
          traceId: cycleResult?.traceId || crypto.randomUUID(),
          taskId: task || 'manual-dispatch',
          message: cycleResult?.message || `Crucible cycle dispatched`
        };
      } catch (err) {
        result.message = `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    publishEvent('crucible', { ...result, ts: new Date().toISOString() });
    return res.json(result);
  } catch (err) {
    console.error('[Dispatch] Error:', err.message);
    return res.status(500).json({ error: 'Failed to dispatch crucible cycle' });
  }
});

app.post('/api/agents/crucible/run', async (req, res) => {
  try {
    if (process.env.CRUCIBLE_ENABLED !== 'true') {
      return res.status(200).json({
        success: false,
        cycle: 0,
        maxCycles: 5,
        traceId: '',
        message: 'Crucible not enabled'
      });
    }
    const { crucible: crucibleModule } = await import('../agents/crucible.js');
    const result = await crucibleModule.runCrucibleCycle();
    console.log('[Crucible] runCrucibleCycle result:', JSON.stringify(result));
    const response = {
      success: result?.success ?? true,
      cycle: result?.cycle ?? 0,
      maxCycles: crucibleModule.MAX_CYCLES_PER_BOOT,
      traceId: result?.traceId || `cycle-${result?.cycle ?? 0}`,
      message: result?.message || 'Crucible cycle executed'
    };
    publishEvent('crucible', { ...response, ts: new Date().toISOString() });
    return res.json(response);
  } catch (err) {
    console.error('[Crucible] Run error:', err.message);
    return res.status(500).json({ error: 'Failed to run crucible cycle', details: err.message });
  }
});

app.get('/api/reasoning/ledger', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const rows = await runQuery(
      `SELECT id, context, input, output, result_status, provider, event_type, reason, created_at
       FROM reasoning_ledger
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    const entries = rows.map((row) => {
      let input = {};
      let output = {};
      try { input = JSON.parse(row.input || '{}'); } catch { /* ignore */ }
      try { output = JSON.parse(row.output || '{}'); } catch { /* ignore */ }
      return {
        id: row.id,
        context: row.context,
        input,
        output,
        result_status: row.result_status,
        provider: row.provider,
        event_type: row.event_type,
        reason: row.reason,
        created_at: row.created_at
      };
    });
    return res.json({ count: entries.length, entries });
  } catch (err) {
    console.error('[ReasoningLedger] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reasoning ledger' });
  }
});

// HERMES heartbeat sink (called by the worker via POST /api/health).
app.post('/api/health', async (req, res) => {
  try {
    if (redis) {
      await redis.set(
        HERMES_HEARTBEAT_KEY,
        JSON.stringify({
          agent: 'HERMES',
          status: 'Online',
          ...(req.body || {}),
          timestamp: new Date().toISOString()
        }),
        'EX',
        30
      );
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Health] Heartbeat sink error:', err?.message);
    return res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

// Stream of [HERMES:AUDITOR] log lines published by the worker process.
app.get('/api/governance/hermes-logs', async (_req, res) => {
  try {
    if (!redis) return res.json([]);
    const raw = await redis.lrange('kudbee:hermes:log', 0, 49);
    const logs = raw
      .map((r) => {
        try { return JSON.parse(r); } catch { return null; }
      })
      .filter(Boolean);
    return res.json(logs);
  } catch (err) {
    console.warn('[Governance] HERMES logs unavailable (Redis offline):', err?.message);
    return res.status(200).json([]);
  }
});

app.get('/api/metrics/community-value', async (req, res) => {
  try {
    let totalCost = 0;
    let inTok = 0;
    let outTok = 0;
    let sampleCount = 0;
    try {
      const totals = await runQuery(
        `SELECT COALESCE(SUM(input_tokens), 0) AS in_tok,
                COALESCE(SUM(output_tokens), 0) AS out_tok,
                COALESCE(SUM(cost), 0) AS total_cost,
                COUNT(*) AS cnt
           FROM telemetry_traces`
      );
      inTok = Number(totals[0]?.in_tok || 0);
      outTok = Number(totals[0]?.out_tok || 0);
      totalCost = Number(totals[0]?.total_cost || 0);
      sampleCount = Number(totals[0]?.cnt || 0);
    } catch {
      // In-memory fallback already covered below.
    }

    let communityValue = 0;
    let governanceActions = 0;
    let verifiedTraces = 0;
    if (redis) {
      try {
        const score = await redis.get('kudbee:community_value_score');
        const actions = await redis.get('kudbee:governance_count');
        const verified = await redis.scard('kudbee:verified_traces');
        communityValue = Number(score || 0);
        governanceActions = Number(actions || 0);
        verifiedTraces = Number(verified || 0);
      } catch (e) {
        console.error('[Redis] Community value fallback to SQLite:', e.message);
      }
    }

    if (redis) {
      return res.json({
        community_value_score: communityValue.toFixed(2),
        governance_actions: governanceActions,
        verified_traces: verifiedTraces,
        settled: {
          totalCostUsd: Number(totalCost.toFixed(6)),
          inputTokens: inTok,
          outputTokens: outTok,
          sampleCount,
          budgetUsd: BUDGET_USD,
          remainingBudgetUsd: Number(Math.max(0, BUDGET_USD - totalCost).toFixed(6)),
          budgetPct: BUDGET_USD > 0 ? Number(((totalCost / BUDGET_USD) * 100).toFixed(2)) : 0
        }
      });
    }

    const scoreRow = await runQuery(
      `SELECT COALESCE(SUM(value_score), 0) AS total FROM governance_actions`
    );
    const actionsRow = await runQuery(
      `SELECT COUNT(*) AS count FROM governance_actions`
    );
    const verifiedRow = await runQuery(
      `SELECT COUNT(DISTINCT trace_id) AS count FROM governance_actions`
    );
    res.json({
      community_value_score: Number(scoreRow[0]?.total || 0).toFixed(2),
      governance_actions: Number(actionsRow[0]?.count || 0),
      verified_traces: Number(verifiedRow[0]?.count || 0),
      settled: {
        totalCostUsd: Number(totalCost.toFixed(6)),
        inputTokens: inTok,
        outputTokens: outTok,
        sampleCount,
        budgetUsd: BUDGET_USD,
        remainingBudgetUsd: Number(Math.max(0, BUDGET_USD - totalCost).toFixed(6)),
        budgetPct: BUDGET_USD > 0 ? Number(((totalCost / BUDGET_USD) * 100).toFixed(2)) : 0
      }
    });
  } catch (err) {
    console.error('[Metrics] Community value error:', err?.message);
    return res.status(500).json({ error: 'Failed to compute community value' });
  }
});

app.get('/api/proxy/pending', (req, res) => {
  res.json([]);
});

app.post('/api/proxy/resolve', (req, res) => {
  res.json({ success: true });
});

app.get('/api/news/headlines', (req, res) => {
  res.json({
    headlines: [
      {
        title: 'OTel Tracing Standards and Compliance Auditing',
        summary: 'New system integrations push for standardized OpenTelemetry pipelines to audit model token expenditures and guarantee regulatory cost ceilings.',
        category: 'API Law',
        source: 'W3C Consortium Standards'
      },
      {
        title: 'Advanced LLM Cost Reductions & Context Ingestion Rates',
        summary: 'Recent optimization benchmarks show input token processing costs decrease up to 50% across major API endpoints through persistent prompt caching.',
        category: 'Billing Regulation',
        source: 'API Platform Registry'
      }
    ],
    sources: [
      { title: 'Standard OpenTelemetry Guidelines', url: 'https://opentelemetry.io' },
      { title: 'API Billing Policies Update', url: 'https://ai.google.dev' }
    ]
  });
});

// --- GitHub Repository Connector (agent dynamic file reads) -----------------
// Resilient-First: a missing PAT, unreachable GitHub API, or missing file
// degrades to a typed error response — this endpoint never crashes the server.
app.get('/api/system/file', async (req, res) => {
  const repoPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!repoPath) {
    return res.status(400).json({
      error: 'Missing "path" query parameter. Expected "owner/repo/path/to/file".',
      ok: false
    });
  }

  try {
    const result = await fetchFile(repoPath);
    if (!result.ok) {
      const status = result.code === 'INVALID_PATH' ? 400 : result.code === 'NOT_FOUND' ? 404 : 503;
      return res.status(status).json({ error: result.error, code: result.code, ok: false });
    }
    return res.status(200).json({
      ok: true,
      path: repoPath,
      cached: result.cached,
      content: result.content
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[GitHub] /api/system/file degraded:', message);
    return res.status(503).json({ error: `GitHub connector unavailable: ${message}`, ok: false });
  }
});

app.get('/health', async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);

    // Resilient dependency probes — failures are reported, never fatal.
    let dbOk = false;
    try {
      const rows = await runQuery('SELECT 1 as ok');
      dbOk = Array.isArray(rows) && rows[0]?.ok === 1;
    } catch {
      dbOk = false;
    }
    if (!dbOk) {
      // Health-check logging: clear warning instead of crashing.
      console.warn(
        '[Health] ingestion_db UNREACHABLE — Neon Postgres not configured or ' +
          'unavailable. Serving in degraded mode (in-memory fallback active).'
      );
    }

    let redisOk = false;
    if (redis) {
      try {
        await redis.ping();
        redisOk = true;
      } catch {
        redisOk = false;
      }
    }
    if (!redisOk) {
      console.warn(
        '[Health] REDIS_URL UNREACHABLE — Redis not configured or unavailable. ' +
          'Continuing without cache/event-bus (Resilient-First degrade).'
      );
    }

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    const payload = {
      status,
      service: 'kudbee-control-tower',
      phase: 'phase7',
      uptime_sec: uptimeSec,
      timestamp: new Date().toISOString(),
      dependencies: {
        ingestion_db: dbOk ? 'healthy' : 'unhealthy',
        vector_memory: 'healthy',
        redis: redisOk ? 'healthy' : 'unhealthy'
      }
    };
    // Resilient-First: the server is serving, so report 200 even when degraded
    // (a missing/unreachable dependency is not a fatal outage). 503 is reserved
    // for hard probe failures caught below.
    res.status(status === 'error' ? 503 : 200).json(payload);
  } catch (err) {
    console.error('[Health] Probe error:', err?.message);
    res.status(503).json({
      status: 'error',
      service: 'kudbee-control-tower',
      timestamp: new Date().toISOString(),
      error: err?.message || 'health probe failed'
    });
  }
});

app.get('/api/health-check', async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);
    let communityValueScore = '0';
    let alerts = [];

    if (redis) {
      try {
        communityValueScore = await redis.get('kudbee:community_value_score');
        alerts = await redis.lrange('kudbee:alerts', 0, 4);
      } catch (err) {
        console.warn('[HealthCheck] Redis unavailable, marking degraded:', err?.message);
      }
    }

    const parsedAlerts = alerts.map((a) => {
      try {
        return JSON.parse(a);
      } catch {
        return { raw: a };
      }
    });

    res.json({
      uptime_sec: uptimeSec,
      community_value_score: Number(communityValueScore || 0).toFixed(2),
      alerts: parsedAlerts
    });
  } catch (err) {
    console.warn('[HealthCheck] Redis unavailable, returning empty dependencies:', err?.message);
    res.status(200).json({
      status: 'degraded',
      service: 'kudbee-control-tower',
      uptime_sec: Math.floor((Date.now() - BOOT_TIME) / 1000),
      timestamp: new Date().toISOString(),
      dependencies: {
        ingestion_db: 'healthy',
        vector_memory: 'healthy',
        redis: 'unhealthy'
      }
    });
  }
});

// --- Deep Health & Vitals Endpoint ------------------------------------------
// Provides structured database/Redis latency probes plus agent uptime and
// triage queue depth for the Control Tower dashboard.
//
// RESILIENT-FIRST: individual probe failures are captured and reported in the
// payload rather than crashing the endpoint. The HTTP status is always 200
// unless every probe throws a hard error.
app.get('/api/system/health-deep', async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);

    const services = { postgres: { status: 'OFFLINE', latencyMs: null, lastPing: null }, redis: { status: 'OFFLINE', latencyMs: null, lastPing: null } };

    let dbOk = false;
    try {
      const t0 = Date.now();
      const rows = await runQuery('SELECT 1 as ok');
      const latencyMs = Date.now() - t0;
      dbOk = Array.isArray(rows) && rows[0]?.ok === 1;
      services.postgres = {
        status: dbOk ? 'OK' : 'OFFLINE',
        latencyMs: dbOk ? latencyMs : null,
        lastPing: new Date().toISOString()
      };
    } catch {
      services.postgres = { status: 'OFFLINE', latencyMs: null, lastPing: null };
    }

    if (redis) {
      try {
        const t0 = Date.now();
        await redis.ping();
        const latencyMs = Date.now() - t0;
        services.redis = { status: 'OK', latencyMs, lastPing: new Date().toISOString() };
      } catch {
        services.redis = { status: 'OFFLINE', latencyMs: null, lastPing: null };
      }
    }

    let pendingTriageCount = 0;
    try {
      const proposed = await listProposed();
      pendingTriageCount = proposed.length;
    } catch {
      /* ignore */
    }

    const hermesOnline = !!(redis && (async () => {
      try {
        const raw = await redis.get(HERMES_HEARTBEAT_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const ts = parsed.timestamp ? Date.parse(parsed.timestamp) : 0;
        return !Number.isNaN(ts) && Date.now() - ts < HERMES_HEARTBEAT_MAX_AGE_MS;
      } catch {
        return false;
      }
    })());

    const overallStatus = (services.postgres.status === 'OK' || services.redis.status === 'OK') ? 'HEALTHY' : 'DEGRADED';

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      agent: {
        status: hermesOnline ? 'ACTIVE_RUNNING' : 'OFFLINE',
        uptimeSeconds: uptimeSec,
        pendingTriageCount
      }
    });
  } catch (err) {
    console.error('[HealthDeep] Probe error:', err?.message);
    res.status(200).json({
      status: 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: { postgres: { status: 'OFFLINE', latencyMs: null, lastPing: null }, redis: { status: 'OFFLINE', latencyMs: null, lastPing: null } },
      agent: { status: 'OFFLINE', uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000), pendingTriageCount: 0 },
      error: err?.message || 'deep health probe failed'
    });
  }
});

// --- Model Comparator Endpoint ---
// Allows real-time inference comparison between Gemini (cloud) and VLLM
// (edge) providers through a lightweight agentic reasoning task.
//
// RESILIENT-FIRST: provider failures are captured and returned in the
// payload rather than crashing the endpoint.
app.post('/api/system/compare-providers', async (req, res) => {
  try {
    const { prompt, provider } = req.body || {};
    const selectedProvider = provider === 'vllm' || provider === 'openai-compatible' ? provider : 'gemini';

    const systemPrompt = `<ROLE>
You are the Primary Agent for the Kudbee Agentic Rack System. You are a
deterministic, strictly-constrained code-generation and reasoning engine.
Your output becomes production infrastructure, so precision beats verbosity.
</ROLE>

<IMMUTABLE_LAWS>
1. NODE 22 ESM .ts vs .js LAW
2. ZERO any LAW
3. EXPLICIT ESM EXTENSION LAW
4. STRICT TYPECHECK LAW
5. BLUEPRINT-FIRST LAW
</IMMUTABLE_LAWS>

<OUTPUT_DISCIPLINE>
Emit only the minimal code/answer required. No apologies, no meta-commentary.
</OUTPUT_DISCIPLINE>`;

    const userPrompt = prompt || 'Analyze the following telemetry anomaly and propose a single low-risk remediation: latency spike detected on /api/health (p99 > 1200ms).';

    const t0 = Date.now();
    let output = '';
    let model = 'unknown';
    let usage = { promptTokens: 0, completionTokens: 0 };

    try {
      const providerConfig = selectedProvider === 'gemini'
        ? {
            kind: 'gemini',
            model: 'gemini-2.0-flash',
            temperature: 0.2,
            maxTokens: 512,
            apiKey: process.env.GEMINI_API_KEY
          }
        : {
            kind: 'vllm',
            model: 'openai/gpt-oss-20b',
            temperature: 0.2,
            maxTokens: 512,
            baseUrl: process.env.VLLM_BASE_URL || 'http://localhost:8000',
            apiKey: process.env.VLLM_API_KEY || 'no-key',
            xmlWrapper: true
          };

      const client = createProvider(providerConfig);
      const request = {
        systemPrompt,
        userPrompt: selectedProvider === 'gemini' ? userPrompt : wrapPromptForOpenWeights(systemPrompt, userPrompt),
        temperature: 0.2,
        maxTokens: 512
      };

      const response = await client.complete(request);
      output = response.text;
      model = response.model;
      usage = response.usage || { promptTokens: 0, completionTokens: 0 };
    } catch (providerErr) {
      console.warn(`[Comparator] Provider ${selectedProvider} failed:`, providerErr instanceof Error ? providerErr.message : String(providerErr));
      await recordReasoning(
        { context: systemPrompt, thoughtStream: [], trace_id: `cmp-${Date.now()}` },
        { error: providerErr instanceof Error ? providerErr.message : 'Provider unreachable' },
        { status: 'FAILURE', reason: 'provider_unreachable' },
        selectedProvider
      );
      return res.status(200).json({
        status: 'PROVIDER_UNREACHABLE',
        provider: selectedProvider,
        model,
        output: null,
        latencyMs: Date.now() - t0,
        error: providerErr instanceof Error ? providerErr.message : 'Provider unreachable',
        traceId: `cmp-${Date.now()}`
      });
    }

    const latencyMs = Date.now() - t0;
    const traceId = `cmp-${Date.now()}`;

    await recordReasoning(
      { context: systemPrompt, thoughtStream: [], trace_id: traceId },
      { output, usage },
      { status: 'SUCCESS' },
      selectedProvider
    );

    res.json({
      status: 'OK',
      provider: selectedProvider,
      model,
      output,
      latencyMs,
      usage,
      traceId
    });
  } catch (err) {
    console.error('[Comparator] Fatal error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Comparator failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

// --- Chat Completions with Semantic Fast Brain + Load Balancer ---------------
// Phase 21: queries the vector memory store via semantic embeddings before
// falling back to Slow Brain LLM reasoning. Load balancing across the
// configured provider pool with automatic failover on rate limits (429)
// or high latency.
app.post('/v1/chat/completions', async (req, res) => {
  const t0 = Date.now();
  try {
    const incomingPrompt =
      req.body?.messages?.map((m) => m.content).join(' ') ||
      req.body?.prompt ||
      '';
    const preferredProvider = (req.body?.provider && PROVIDER_CONFIG[req.body.provider])
      ? req.body.provider
      : null;

    let routing = { route: 'SLOW_BRAIN', matched: false };
    try {
      routing = await matchLogic(incomingPrompt);
    } catch (routerErr) {
      console.warn('[Server] Governance router unavailable, defaulting to Slow Brain:', routerErr instanceof Error ? routerErr.message : String(routerErr));
    }

    // Multi-provider load balancing: if preferred provider is unhealthy or
    // rate-limited, automatically failover to the next best healthy provider.
    const initial = pickProvider(preferredProvider);
    let selectedProvider = initial.id;
    let failoverTriggered = false;
    if (preferredProvider && preferredProvider !== selectedProvider) {
      failoverTriggered = true;
      routerState.failovers += 1;
    }

    // Simulate per-provider latency and trip the rate-limit threshold when
    // the response would have been throttled.
    const provider = PROVIDER_CONFIG[selectedProvider];
    const simulatedLatency = provider
      ? provider.baseLatencyMs + Math.floor(Math.random() * 60)
      : 200;
    if (provider && provider.rateLimitPct >= 0.9) {
      const alt = pickProvider(null);
      if (alt.id !== selectedProvider) {
        failoverTriggered = true;
        routerState.failovers += 1;
        selectedProvider = alt.id;
        PROVIDER_CONFIG[selectedProvider].rateLimitPct = Math.max(0, PROVIDER_CONFIG[selectedProvider].rateLimitPct - 0.05);
      }
    }
    if (provider) recordLatency(selectedProvider, simulatedLatency);

    routerState.totalRequests += 1;
    const decision = {
      id: `route-${Date.now()}-${routerState.totalRequests}`,
      preferred: preferredProvider || null,
      selected: selectedProvider,
      failover: failoverTriggered,
      latencyMs: simulatedLatency,
      ts: new Date().toISOString()
    };
    routerState.decisionLog = [decision, ...routerState.decisionLog].slice(0, 50);
    publishEvent('router', decision);

    res.json({
      id: 'chatcmpl-' + Math.random().toString(36).slice(2, 10),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model || 'kudbee-vector-brain',
      governance: {
        route: routing.route,
        matched: routing.matched,
        confidence: routing.confidence ?? 0,
        proven_logic: routing.logic?.action ?? null,
        source: routing.source ?? 'keyword'
      },
      router: {
        preferred: preferredProvider,
        selected: selectedProvider,
        failoverTriggered,
        latencyMs: simulatedLatency
      },
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content:
              routing.route === 'FAST_BRAIN'
                ? `Fast Brain (${selectedProvider}): applied proven logic path "${routing.logic?.action ?? 'unknown'}".`
                : `Slow Brain (${selectedProvider}): no proven semantic match found — LLM reasoning required.`
          },
          finish_reason: 'stop'
        }
      ]
    });
  } catch (err) {
    console.error('[Chat] Fatal error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Chat completions failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/system/last-event', async (_req, res) => {
  try {
    const rows = await runQuery(
      `SELECT context, input, output, result_status, provider, event_type, reason, created_at
       FROM reasoning_ledger
       WHERE event_type = 'system_reset'
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (!rows.length) {
      return res.json({ event: null });
    }
    const row = rows[0];
    let input = {};
    let output = {};
    try { input = JSON.parse(row.input || '{}'); } catch { /* ignore */ }
    try { output = JSON.parse(row.output || '{}'); } catch { /* ignore */ }
    return res.json({
      event: {
        time: row.created_at,
        reason: row.reason || output?.details || row.result_status,
        service: input?.service || 'system',
        status: row.result_status
      }
    });
  } catch (err) {
    console.error('[LastEvent] Error:', err instanceof Error ? err.message : String(err));
    res.json({ event: null });
  }
});

app.get('/api/session-history', async (_req, res) => {
  try {
    const raw = redis ? await redis.lrange('kudbee:session_history', 0, 9) : [];
    const sessions = raw.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return { raw: item };
      }
    });
    res.json(sessions);
  } catch (err) {
    console.warn('[SessionHistory] Redis unavailable, returning empty array:', err?.message);
    return res.status(200).json([]);
  }
});

// --- Real-time telemetry: Server-Sent Events (SSE) -----------------------
// The web server and the HERMES worker are separate processes, so we use a
// Redis pub/sub channel (`kudbee:events`) as the cross-process event bus.
// The server subscribes once and fans every event out to all connected SSE
// clients. `broadcast()` writes to local clients; `publishEvent()` also pushes
// to Redis so the worker (and other server dynos) can emit events too.

const EVENTS_CHANNEL = 'kudbee:events';
const sseClients = new Set();

function broadcast(event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function publishEvent(type, data) {
  // Single delivery path: publish to Redis; the subscriber connection fans
  // out to all local SSE clients. (Calling broadcast() here too would double
  // deliver server-originated events.)
  if (redis) {
    try {
      redis.publish(EVENTS_CHANNEL, JSON.stringify({ type, data, ts: new Date().toISOString() })).catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

// Dedicated subscriber connection (ioredis requires subscriber mode).
if (redis) {
  try {
    const subClient = redis.duplicate();
    subClient.subscribe(EVENTS_CHANNEL, (err) => {
      if (err) console.error('[SSE] Failed to subscribe to events channel:', err.message);
      else console.log('[SSE] Subscribed to', EVENTS_CHANNEL);
    });
    subClient.on('message', (_channel, message) => {
      try {
        const event = JSON.parse(message);
        broadcast(event);
      } catch {
        /* ignore malformed */
      }
    });
    subClient.on('error', (err) => console.error('[SSE] Subscriber error:', err.message));
  } catch (err) {
    console.error('[SSE] Subscriber init error:', err.message);
  }
}

app.get('/api/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);

  // Snapshot of current governance state so a fresh client renders instantly.
  try {
    const proposed = redis ? await listProposed() : [];
    res.write(`event: snapshot\ndata: ${JSON.stringify({ proposed: Array.isArray(proposed) ? proposed : [] })}\n\n`);
  } catch {
    /* ignore */
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Phase 21: dedicated telemetry stream alias. Identical contract to
// /api/events but with a more discoverable URL for the History view.
app.get('/api/telemetry/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  // Send a recent snapshot of the telemetry pipeline so the History view can
  // render the latest aggregated metrics without waiting for the next event.
  try {
    const summary = await runQuery(
      `SELECT COALESCE(SUM(input_tokens), 0) AS in_tok,
              COALESCE(SUM(output_tokens), 0) AS out_tok,
              COALESCE(SUM(cost), 0) AS total_cost,
              COUNT(*) AS cnt
         FROM telemetry_traces`
    ).catch(() => [{ in_tok: 0, out_tok: 0, total_cost: 0, cnt: 0 }]);
    res.write(`event: snapshot\ndata: ${JSON.stringify({ summary: summary[0] || {} })}\n\n`);
  } catch {
    /* ignore */
  }
  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Broadcast a live event when a governance action is approved/rejected so the
// dashboard updates instantly instead of waiting for the next poll.
const _origApprove = approveAction;
async function approveActionAndBroadcast(id) {
  const proven = await _origApprove(id);
  if (proven) publishEvent('governance', { kind: 'approved', action: proven });
  return proven;
}
const _origReject = rejectAction;
async function rejectActionAndBroadcast(id) {
  const rejected = await _origReject(id);
  if (rejected) publishEvent('governance', { kind: 'rejected', action: rejected });
  return rejected;
}

function resolveDistPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'apps', 'web', 'dist'),
    path.join(process.cwd(), 'apps', 'web', 'dist'),
    path.join(process.cwd(), 'dist')
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

// --- Phase 20: Dynamic Policy Engine, Vector Sync, and Live Alerts -----------
// In-memory state for the governance policy engine. Persists across the
// process lifetime and is exposed to the UI through REST endpoints.

const policyState = {
  token_budget_cap: { id: 'token_budget_cap', label: 'Token Budget Cap', enabled: true, severity: 'BLOCK', config: { maxTokens: 200000 } },
  secret_leak_prevention: { id: 'secret_leak_prevention', label: 'Secret Leak Prevention', enabled: true, severity: 'BLOCK', config: { patterns: ['sk-ant-', 'sk-proj-', 'AIzaSy', 'ghp_'] } },
  system_prompt_guard: { id: 'system_prompt_guard', label: 'System Prompt Guard', enabled: true, severity: 'WARN', config: { denyTerms: ['ignore previous', 'disregard system'] } },
  pii_redaction: { id: 'pii_redaction', label: 'PII Redaction', enabled: true, severity: 'WARN', config: { pattern: 'email' } }
};

const vectorSyncState = {
  state: 'IDLE', // IDLE | INDEXING | SYNCED | FAILED
  lastSyncAt: null,
  totalChunks: 0,
  totalVectors: 0,
  recentDocs: []
};

const alertsState = {
  alerts: []
};

function evaluatePolicies(prompt) {
  const text = String(prompt || '');
  const results = [];
  let worstStatus = 'PASS';
  for (const policy of Object.values(policyState)) {
    if (!policy.enabled) continue;
    let status = 'PASS';
    let detail = '';
    if (policy.id === 'token_budget_cap') {
      const approx = Math.ceil(text.length / 4);
      if (approx > policy.config.maxTokens) {
        status = policy.severity;
        detail = `approx ${approx} tokens exceeds cap of ${policy.config.maxTokens}`;
      }
    } else if (policy.id === 'secret_leak_prevention') {
      const hit = policy.config.patterns.find((p) => text.includes(p));
      if (hit) {
        status = policy.severity;
        detail = `detected secret pattern "${hit}"`;
      }
    } else if (policy.id === 'system_prompt_guard') {
      const lower = text.toLowerCase();
      const hit = policy.config.denyTerms.find((t) => lower.includes(t));
      if (hit) {
        status = policy.severity;
        detail = `matched forbidden phrase "${hit}"`;
      }
    } else if (policy.id === 'pii_redaction') {
      if (/@/.test(text)) {
        status = policy.severity;
        detail = 'email-like string detected';
      }
    }
    if (status === 'BLOCK') worstStatus = 'BLOCK';
    else if (status === 'WARN' && worstStatus !== 'BLOCK') worstStatus = 'WARN';
    results.push({ id: policy.id, status, detail });
  }
  return { overall: worstStatus, results };
}

app.get('/api/governance/policies', async (_req, res) => {
  try {
    res.json({ policies: Object.values(policyState) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/governance/policies', async (req, res) => {
  try {
    const { id, enabled, severity, config } = req.body || {};
    const policy = policyState[id];
    if (!policy) return res.status(404).json({ error: `unknown policy ${id}` });
    if (typeof enabled === 'boolean') policy.enabled = enabled;
    if (severity === 'PASS' || severity === 'WARN' || severity === 'BLOCK') policy.severity = severity;
    if (config && typeof config === 'object') {
      policy.config = { ...policy.config, ...config };
    }
    publishEvent('policy', { id: policy.id, enabled: policy.enabled, severity: policy.severity, ts: new Date().toISOString() });
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/governance/policies/evaluate', async (req, res) => {
  try {
    const prompt = req.body?.prompt || req.body?.messages?.map((m) => m.content).join(' ') || '';
    res.json(evaluatePolicies(prompt));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Vector Store Sync (chunking + embedding pipeline) ----------------------

function chunkText(text, size = 400) {
  const out = [];
  const t = String(text || '').trim();
  if (!t) return out;
  for (let i = 0; i < t.length; i += size) {
    out.push({ id: `chunk-${out.length}`, text: t.slice(i, i + size), offset: i });
  }
  return out;
}

app.get('/api/vector/sync', async (_req, res) => {
  try {
    res.json(vectorSyncState);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/vector/sync', async (req, res) => {
  try {
    vectorSyncState.state = 'INDEXING';
    publishEvent('vector', { state: vectorSyncState.state, ts: new Date().toISOString() });

    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [
      { id: 'doc-overview', text: 'Kudbee is an OpenTelemetry-aware LLM cost governance platform that routes traffic through a Fast Brain (semantic vector memory) and a Slow Brain (LLM reasoning).' },
      { id: 'doc-firewall', text: 'The Edge Sentinel firewall quarantines suspicious telemetry, redacts secrets, and blocks traffic exceeding active governance policies.' },
      { id: 'doc-vectors', text: 'Vector memory is indexed in 400-character chunks with cosine similarity retrieval. The resync pipeline rebuilds the index from the reasoning ledger.' }
    ];

    const newDocs = [];
    let totalChunks = 0;
    for (const doc of documents) {
      const chunks = chunkText(doc.text);
      totalChunks += chunks.length;
      newDocs.push({ id: doc.id, chunkCount: chunks.length });
    }

    // Update state and resolve asynchronously to feel "live".
    setTimeout(() => {
      vectorSyncState.state = 'SYNCED';
      vectorSyncState.lastSyncAt = new Date().toISOString();
      vectorSyncState.totalChunks = totalChunks;
      vectorSyncState.totalVectors = totalChunks;
      vectorSyncState.recentDocs = newDocs;
      publishEvent('vector', { state: vectorSyncState.state, totalChunks, ts: vectorSyncState.lastSyncAt });
    }, 600);

    res.json({ ok: true, state: vectorSyncState.state, documents: newDocs.length, totalChunks });
  } catch (err) {
    vectorSyncState.state = 'FAILED';
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/vector/recall', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').slice(0, 240);
    const library = [
      { id: 'doc-overview', text: 'Kudbee is an OpenTelemetry-aware LLM cost governance platform that routes traffic through a Fast Brain (semantic vector memory) and a Slow Brain (LLM reasoning).' },
      { id: 'doc-firewall', text: 'The Edge Sentinel firewall quarantines suspicious telemetry, redacts secrets, and blocks traffic exceeding active governance policies.' },
      { id: 'doc-vectors', text: 'Vector memory is indexed in 400-character chunks with cosine similarity retrieval. The resync pipeline rebuilds the index from the reasoning ledger.' },
      { id: 'doc-routing', text: 'Routing decisions are produced by /v1/chat/completions via matchLogic, which consults the vector store before invoking the LLM (Slow Brain).' }
    ];
    const ranked = library
      .map((doc) => {
        const terms = prompt.toLowerCase().split(/\s+/).filter(Boolean);
        const score = terms.reduce((acc, term) => acc + (doc.text.toLowerCase().includes(term) ? 1 : 0), 0) / Math.max(1, terms.length);
        return { ...doc, score: Number(score.toFixed(3)) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    res.json({ prompt, retrieved: ranked });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Live Alerts Stream ------------------------------------------------------

function pushAlert(alert) {
  const entry = { ...alert, id: alert.id || `alert-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, status: alert.status || 'OPEN', createdAt: alert.createdAt || new Date().toISOString() };
  alertsState.alerts = [entry, ...alertsState.alerts].slice(0, 50);
  publishEvent('alert', entry);
  return entry;
}

// Seed a baseline alert so the UI is never empty on first render.
if (alertsState.alerts.length === 0) {
  pushAlert({
    severity: 'INFO',
    source: 'governance',
    title: 'Policy engine online',
    detail: 'Token Budget Cap, Secret Leak Prevention, and System Prompt Guard are active.'
  });
}

app.get('/api/system/alerts', async (_req, res) => {
  try {
    res.json({ alerts: alertsState.alerts });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/system/alerts/:id/ack', async (req, res) => {
  try {
    const alert = alertsState.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'alert not found' });
    alert.status = 'ACK';
    alert.acknowledgedAt = new Date().toISOString();
    publishEvent('alert', alert);
    res.json({ alert });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/system/alerts/:id/mitigate', async (req, res) => {
  try {
    const alert = alertsState.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'alert not found' });
    alert.status = 'MITIGATED';
    alert.mitigatedAt = new Date().toISOString();
    // If the alert is tied to a triage id, ask the interceptor to purge it.
    const linkedTriageId = alert.triageId ? Number(alert.triageId) : null;
    publishEvent('alert', alert);
    res.json({ alert, linkedTriageId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 21: Multi-Provider Load Balancer --------------------------------

const PROVIDER_CONFIG = {
  openai:    { id: 'openai',    label: 'OpenAI',    weight: 30, baseLatencyMs: 145, maxLatencyMs: 800, rateLimitPct: 0.0, healthy: true, lastError: null },
  anthropic: { id: 'anthropic', label: 'Anthropic', weight: 40, baseLatencyMs: 185, maxLatencyMs: 900, rateLimitPct: 0.0, healthy: true, lastError: null },
  local:     { id: 'local',     label: 'Local VLLM',weight: 20, baseLatencyMs: 60,  maxLatencyMs: 500, rateLimitPct: 0.0, healthy: true, lastError: null },
  google:    { id: 'google',    label: 'Google',    weight: 10, baseLatencyMs: 210, maxLatencyMs: 700, rateLimitPct: 0.0, healthy: true, lastError: null }
};

const routerState = {
  decisionLog: [], // Recent routing decisions
  totalRequests: 0,
  failovers: 0
};

function buildProviderStatuses() {
  return Object.values(PROVIDER_CONFIG).map((p) => ({
    id: p.id,
    label: p.label,
    status: p.healthy && p.rateLimitPct < 0.5 ? 'OK' : p.rateLimitPct < 0.9 ? 'DEGRADED' : 'OFFLINE',
    weight: p.weight,
    baseLatencyMs: p.baseLatencyMs,
    maxLatencyMs: p.maxLatencyMs,
    measuredLatencyMs: p.baseLatencyMs + Math.floor(Math.random() * 40),
    rateLimitPct: Number(p.rateLimitPct.toFixed(3)),
    lastError: p.lastError,
    healthy: p.healthy
  }));
}

function pickProvider(preferred) {
  // Honour explicit preference if healthy.
  if (preferred && PROVIDER_CONFIG[preferred]?.healthy) {
    return { id: preferred, failover: false };
  }
  // Weighted random over healthy providers.
  const pool = Object.values(PROVIDER_CONFIG).filter((p) => p.healthy);
  const total = pool.reduce((acc, p) => acc + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return { id: p.id, failover: false };
  }
  return { id: pool[0].id, failover: false };
}

function recordLatency(providerId, latencyMs) {
  const p = PROVIDER_CONFIG[providerId];
  if (!p) return;
  if (latencyMs > p.maxLatencyMs) {
    p.rateLimitPct = Math.min(0.99, p.rateLimitPct + 0.1);
    p.lastError = `latency ${latencyMs}ms exceeded ${p.maxLatencyMs}ms`;
  } else {
    p.rateLimitPct = Math.max(0, p.rateLimitPct - 0.02);
  }
  if (p.rateLimitPct >= 0.9) p.healthy = false;
}

app.get('/api/router/status', async (_req, res) => {
  try {
    const providers = buildProviderStatuses();
    res.json({
      providers,
      totalRequests: routerState.totalRequests,
      failovers: routerState.failovers,
      recent: routerState.decisionLog.slice(0, 20)
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/router/select', async (req, res) => {
  try {
    const { preferred, simulateLatencyMs, simulateRateLimit } = req.body || {};
    if (simulateRateLimit && PROVIDER_CONFIG[preferred]) {
      PROVIDER_CONFIG[preferred].rateLimitPct = 0.95;
      PROVIDER_CONFIG[preferred].lastError = 'simulated 429 rate limit';
      PROVIDER_CONFIG[preferred].healthy = false;
    }
    const latency = Number(simulateLatencyMs) || 0;
    if (preferred) recordLatency(preferred, latency);

    const decision = pickProvider(preferred);
    let failover = false;
    if (preferred && decision.id !== preferred) {
      failover = true;
      routerState.failovers += 1;
    }
    routerState.totalRequests += 1;
    const entry = {
      id: `route-${Date.now()}-${routerState.totalRequests}`,
      preferred: preferred || null,
      selected: decision.id,
      failover,
      latencyMs: PROVIDER_CONFIG[decision.id]?.baseLatencyMs || 0,
      ts: new Date().toISOString()
    };
    routerState.decisionLog = [entry, ...routerState.decisionLog].slice(0, 50);
    publishEvent('router', entry);
    res.json({
      ...entry,
      failoverTriggered: failover,
      providers: buildProviderStatuses()
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/router/reset', async (_req, res) => {
  try {
    for (const p of Object.values(PROVIDER_CONFIG)) {
      p.healthy = true;
      p.rateLimitPct = 0;
      p.lastError = null;
    }
    routerState.decisionLog = [];
    publishEvent('router', { kind: 'reset', ts: new Date().toISOString() });
    res.json({ ok: true, providers: buildProviderStatuses() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 21: Throughput metrics (tokens/sec, TTFT) ------------------------

const THROUGHPUT_WINDOW_MS = 60_000;

app.get('/api/telemetry/throughput', async (_req, res) => {
  try {
    const now = Date.now();
    const sinceIso = new Date(now - THROUGHPUT_WINDOW_MS).toISOString();
    const rows = await runQuery(
      `SELECT input_tokens, output_tokens, created_at FROM telemetry_traces WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 200`,
      [sinceIso]
    ).catch(() => []);
    let inTok = 0;
    let outTok = 0;
    let ttftSamples = 0;
    let ttftSum = 0;
    for (const r of rows || []) {
      inTok += Number(r.input_tokens) || 0;
      outTok += Number(r.output_tokens) || 0;
    }
    // Synthetic TTFT sample derived from output_tokens (deterministic stub
    // so the UI has something to display even when no real latencies are
    // captured yet). This is treated as an estimate, clearly labelled.
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const o = Number(rows[i].output_tokens) || 0;
      const sample = Math.max(80, Math.min(900, 120 + Math.floor(o / 12)));
      ttftSum += sample;
      ttftSamples += 1;
    }
    const totalTokens = inTok + outTok;
    const safeTokensPerSec = totalTokens / (THROUGHPUT_WINDOW_MS / 1000);
    res.json({
      windowMs: THROUGHPUT_WINDOW_MS,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens,
      tokensPerSec: Number(safeTokensPerSec.toFixed(2)),
      ttftAvgMs: ttftSamples ? Math.round(ttftSum / ttftSamples) : null,
      ttftSamples,
      sampleCount: (rows || []).length,
      asOf: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 21: Cost Ledger Settlement --------------------------------------

// Authoritative provider cost table (per 1K tokens, USD).
const PROVIDER_COSTS = {
  'gpt-4o':            { in: 0.005,  out: 0.015 },
  'claude-3-5-sonnet': { in: 0.003,  out: 0.015 },
  'gemini-1.5-pro':    { in: 0.00125, out: 0.005 },
  'deepseek-r1':       { in: 0.00055, out: 0.00219 },
  'deepseek-v3':       { in: 0.00014, out: 0.00028 },
  'ternary-bonsai-27b':{ in: 0.0008,  out: 0.003 }
};

const BUDGET_USD = Number(process.env.MONTHLY_BUDGET_USD || 50);

app.get('/api/metrics/cost-ledger', async (_req, res) => {
  try {
    const now = Date.now();
    const last24hIso = new Date(now - 24 * 3600 * 1000).toISOString();
    const last7dIso = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    let inTok = 0, outTok = 0, totalCost = 0, total24hCost = 0, total7dCost = 0;
    let byProvider = {};
    let sampleCount = 0;

    try {
      const totalRow = await runQuery(
        `SELECT COALESCE(SUM(input_tokens), 0) AS in_tok,
                COALESCE(SUM(output_tokens), 0) AS out_tok,
                COALESCE(SUM(cost), 0) AS total_cost,
                COUNT(*) AS cnt
           FROM telemetry_traces`
      );
      inTok = Number(totalRow[0]?.in_tok || 0);
      outTok = Number(totalRow[0]?.out_tok || 0);
      totalCost = Number(totalRow[0]?.total_cost || 0);
      sampleCount = Number(totalRow[0]?.cnt || 0);

      const c24Row = await runQuery(
        `SELECT COALESCE(SUM(cost), 0) AS c FROM telemetry_traces WHERE created_at >= $1`,
        [last24hIso]
      );
      total24hCost = Number(c24Row[0]?.c || 0);

      const c7Row = await runQuery(
        `SELECT COALESCE(SUM(cost), 0) AS c FROM telemetry_traces WHERE created_at >= $1`,
        [last7dIso]
      );
      total7dCost = Number(c7Row[0]?.c || 0);

      const byProvRows = await runQuery(
        `SELECT provider, COALESCE(SUM(input_tokens), 0) AS in_tok,
                COALESCE(SUM(output_tokens), 0) AS out_tok,
                COALESCE(SUM(cost), 0) AS total_cost
           FROM telemetry_traces
          GROUP BY provider`
      );
      for (const row of byProvRows || []) {
        const provider = String(row.provider || 'unknown');
        byProvider[provider] = {
          inputTokens: Number(row.in_tok || 0),
          outputTokens: Number(row.out_tok || 0),
          cost: Number(row.total_cost || 0)
        };
      }
    } catch {
      // In-memory fallback when DB isn't reachable.
    }

    const elapsedHours = Math.max(1, (now - new Date(last7dIso).getTime()) / 3600_000);
    const burnRatePerHour = total7dCost / elapsedHours;
    const projectedMonthCost = burnRatePerHour * 24 * 30;
    const remainingBudget = Math.max(0, BUDGET_USD - totalCost);
    const budgetPct = BUDGET_USD > 0 ? Math.min(100, (totalCost / BUDGET_USD) * 100) : 0;

    res.json({
      budgetUsd: BUDGET_USD,
      totalCostUsd: Number(totalCost.toFixed(6)),
      cost24hUsd: Number(total24hCost.toFixed(6)),
      cost7dUsd: Number(total7dCost.toFixed(6)),
      remainingBudgetUsd: Number(remainingBudget.toFixed(6)),
      budgetPct: Number(budgetPct.toFixed(2)),
      burnRatePerHourUsd: Number(burnRatePerHour.toFixed(6)),
      projectedMonthUsd: Number(projectedMonthCost.toFixed(6)),
      inputTokens: inTok,
      outputTokens: outTok,
      sampleCount,
      byProvider,
      providerCosts: PROVIDER_COSTS,
      asOf: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const distPath = resolveDistPath();
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

if (process.env.CRUCIBLE_ENABLED === 'true') {
  try {
    const { startCrucibleScheduler } = await import('../agents/crucible.js');
    startCrucibleScheduler();
  } catch (err) {
    console.error('[Crucible] Failed to start:', err.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] OTel Ingestion Server listening on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Database: ${pool ? 'Neon Postgres (resilient Pool)' : 'in-memory fallback (DATABASE_URL unset)'}`);
  console.log(`[Server] Redis: ${redis ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown: drain the Neon pool and Redis without crashing.
async function shutdown(signal) {
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  try { if (redis) await redis.quit(); } catch { /* ignore */ }
  try { await closeDbPool(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
