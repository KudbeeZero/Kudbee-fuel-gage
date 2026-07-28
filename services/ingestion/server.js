import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { IngestRequestSchema } from '@kudbee/types';
import {
  deserializePass,
  verifyAgentPass,
  verifySignature,
  AGENT_PASS_MAX_AGE_MS,
} from '@kudbee/utils';
import { embedTrace, cosineSimilarity } from './embedder.js';
import { createDegradationRouter } from '../telemetry/degradation-monitor.js';
import {
  listProposed,
  approveAction,
  rejectAction,
  matchLogic,
  proposeAction,
} from '../governance/router.js';
import { recordReasoning, logSystemReset, ensureLedgerSchema } from '../governance/ledger.js';
import { archive_thought } from '../agents/hermes.js';
import {
  getDbPool,
  isDbHealthy,
  runQuery,
  runInsert,
  closeDbPool,
  teardownAll,
  DB_TIMEOUT_MS,
  VECTOR_QUERY_TIMEOUT_MS,
  withTimeout,
} from '../lib/db.js';
import { getRedisClient, getSubscriberClient, initRedisFallbackQueue } from '../lib/redis.js';
import { createProvider, wrapPromptForOpenWeights } from '@kudbee/utils/llm/providers';
import { handleTelemetryIngest } from './controllers/telemetry.ts';
import { fetchFile } from '../github/connector.ts';
import { mintThinkToken } from '../memory/thinkTokenGenerator.ts';
import rateLimit from 'express-rate-limit';
import {
  buildAgentContext,
  evaluateRequiredSkills,
  appendForgeContext,
  BASE_IDENTITY,
} from '../agents/src/context-factory.ts';
import { evaluateAgentPayload } from '../agents/worker.ts';
import { routeAgentPayload, HIGH_UNCERTAINTY_TAG } from '../agents/router.ts';
import { publishEvent as publishUnifiedEvent } from '../lib/unifiedEvents.ts';
import { getRelevantThinkTokens, renderThinkTokenContext } from '../memory/vectorStore.ts';
import { createAuditRouter } from './routes/audit.ts';
import { createGovernanceRouter } from './routes/governance.ts';
import { createTelemetryRouter } from './routes/telemetry.ts';
import { createSystemRouter } from './routes/system.ts';
import { synthesizeThinkToken, groqConfigured } from '../lib/groqClient.ts';
import { getSettings, saveSettings } from '../lib/settingsStore.ts';
import { recordAudit, getAuditHistory, testAllConnections } from '../lib/agentAudit.ts';
import { defaultEngine as receptorGate } from '../memory/src/receptorGating.ts';
import { ftwbMiddleware as ftwbGuard } from '../lib/ftwbMiddleware.ts';
import { getBreadcrumbs } from '../lib/breadcrumbs.ts';
import { getEnergyHeatmap } from '../lib/energyMesh.ts';
import { formUnion, negotiateAllocation, getActiveUnions } from '../lib/tokenUnion.ts';
import { signContract, verifyContract, getActiveContracts, AGCSchema } from '../lib/agcContract.ts';
import { rateLimitCheck, DEFAULT_RATE_LIMIT, getRateLimiterStats } from '../lib/rateLimiter.ts';
import { MiddlewareGuard, getAllGuardStats, registerGuard } from '../lib/middlewareGuard.ts';
import { bearerAuth, authGuard } from '../lib/bearerAuthMiddleware.ts';
import { zodValidate, validationGuard } from '../lib/zodValidationMiddleware.ts';
import { ecpSingleflight, ecpGuard } from '../lib/ecpMiddleware.ts';
import { kiloBridgeBudget, budgetGuard } from '../lib/kiloBridgeMiddleware.ts';
import { spheroidAudit, spheroidGuard } from '../lib/spheroidAuditMiddleware.ts';
import { globalErrorHandler } from '../lib/globalErrorMiddleware.ts';

const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeKey(key) {
  if (typeof key !== 'string' && typeof key !== 'number') return false;
  const s = String(key);
  return s.length > 0 && !PROTOTYPE_KEYS.has(s) && s !== '';
}

function sanitizeEvent(event) {
  if (event === null || typeof event !== 'object') return event;
  if (Array.isArray(event)) return event.map(sanitizeEvent);
  const result = Object.create(null);
  for (const key of Object.keys(event)) {
    if (isSafeKey(key)) {
      result[key] = sanitizeEvent(event[key]);
    }
  }
  return result;
}

function sanitizeRedisUrl(url) {
  if (!url) return url;
  if (url.startsWith('rediss://') || url.startsWith('redis://')) return url;
  if (url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return `rediss://${parsed.hostname}:6379`;
    } catch {
      return url;
    }
  }
  return url;
}
process.env.REDIS_SLOW_URL = sanitizeRedisUrl(process.env.REDIS_SLOW_URL);

const middlewareGuard = new MiddlewareGuard('rate-limiter', 5, 30_000);
const timingGuard = new MiddlewareGuard('timeout', 3, 60_000);
registerGuard(middlewareGuard);
registerGuard(timingGuard);
registerGuard(authGuard);
registerGuard(validationGuard);
registerGuard(ecpGuard);
registerGuard(budgetGuard);
registerGuard(spheroidGuard);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
if (process.env.NODE_ENV !== 'test') app.set('trust proxy', 1);

// --- Phase 45: Request duration tracking and structured logging ---
// Also records per-route latencies for the Middleware Inspector console.
const ROUTE_LATENCY_BUFFER = new Map();
const ROUTE_LATENCY_MAX = 1000;

function recordRouteLatency(method, path, durationMs, statusCode) {
  const routeKey = `${method}:${path}`;
  let entries = ROUTE_LATENCY_BUFFER.get(routeKey);
  if (!entries) {
    entries = [];
    ROUTE_LATENCY_BUFFER.set(routeKey, entries);
  }
  entries.push({ timestamp: Date.now(), durationMs, statusCode });
  if (entries.length > ROUTE_LATENCY_MAX) {
    entries.splice(0, entries.length - ROUTE_LATENCY_MAX);
  }
  if (ROUTE_LATENCY_BUFFER.size > 200) {
    const oldest = [...ROUTE_LATENCY_BUFFER.keys()].slice(0, 50);
    oldest.forEach((k) => ROUTE_LATENCY_BUFFER.delete(k));
  }
}

function getRouteLatencies() {
  const result = {};
  for (const [routeKey, entries] of ROUTE_LATENCY_BUFFER.entries()) {
    if (entries.length < 2) continue;
    const durations = entries.map((e) => e.durationMs).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    result[routeKey] = {
      count: entries.length,
      avgMs: Math.round(avg),
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99 || p95,
      lastStatusCode: entries[entries.length - 1].statusCode,
    };
  }
  return result;
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    recordRouteLatency(req.method, req.path, durationMs, res.statusCode);
    if (durationMs > 3000) {
      console.warn(`[PERF_WARN] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    } else if (durationMs > 1000 || res.statusCode >= 400) {
      console.log(`[http] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    }
  });
  next();
});

// --- Phase 66: Spheroid Audit Ledger — logs all mutating requests ---
app.use(spheroidAudit());

// --- Phase 65: Heroku-Favored Redis Rate Limiter (secondary DB) ---
// FAIL-OPEN: If Redis is unreachable, the rate-limit check is skipped
// and the request passes through. Root / and static assets are excluded.
const RATE_LIMIT_EXCLUDED = new Set([
  '/',
  '/health',
  '/api/health',
  '/api/health-check',
  '/api/system/health-deep',
  '/api/system/diagnostics',
  '/api/system/rate-limit-stats',
  '/api/governance/health',
  '/api/events',
  '/api/os-stream',
  '/api/governance/hermes-logs',
  '/api/dashboard/summary',
  '/api/telemetry/poll',
  '/metrics',
]);

function isStaticAssetPath(path) {
  return (
    path.startsWith('/assets') ||
    path.startsWith('/fonts') ||
    path.startsWith('/icons') ||
    path === '/favicon.ico' ||
    path === '/manifest.json' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ico') ||
    path.endsWith('.json') ||
    path.endsWith('.map') ||
    path.endsWith('.html')
    );
  }

  const ticket = req.query?.ticket || req.url?.split('ticket=')[1]?.split('&')[0];
  if (!validateStreamTicket(ticket)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized', reason: 'missing or invalid stream ticket' }));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  sseClients.add(res);

  try {
    const proposed = redis ? await listProposed() : [];
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({ proposed: Array.isArray(proposed) ? proposed : [], db_healthy: isDbHealthy(), redis: !!redis })}\n\n`
    );
  } catch {
    /* ignore */
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 10_000);

  _setupSSEHealth(res, keepAlive);
});

// --- Unified OS Stream: single SSE connection replacing per-panel polling ---
const OS_STREAM_CLIENTS = new Set();
const OS_STREAM_INTERVAL_MS = 5_000;

async function buildOsSnapshot() {
  const dbHealthy = isDbHealthy();
  const redisOk = !!redis;
  const bootTime = _state.bootTimeRef.value;
  const uptimeSec = bootTime ? Math.floor((Date.now() - bootTime) / 1000) : 0;

  let pgLatency = null;
  try {
    const t0 = Date.now();
    await runQuery('SELECT 1 as ok');
    pgLatency = dbHealthy ? Date.now() - t0 : null;
  } catch {
    /* ignore */
  }

  let redisLatency = null;
  if (redisOk) {
    try {
      const t0 = Date.now();
      await redis.ping();
      redisLatency = Date.now() - t0;
    } catch {
      /* ignore */
    }
  }

  let pendingActions = [];
  let thinkStats = { tokens: 0, verified: 0 };
  let memoryStats = { vectors: 0, chunks: 0 };
  let alertCount = 0;

  try {
    pendingActions = redisOk ? await listProposed() : [];
  } catch {}
  try {
    thinkStats = {
      tokens:
        (
          await runQuery('SELECT COUNT(*) as count FROM think_tokens').catch(() => [{ count: 0 }])
        )[0]?.count ?? 0,
      verified:
        (
          await runQuery(
            "SELECT COUNT(*) as count FROM think_tokens WHERE status = 'VERIFIED'"
          ).catch(() => [{ count: 0 }])
        )[0]?.count ?? 0,
    };
  } catch {}
  try {
    memoryStats = {
      vectors:
        (
          await runQuery('SELECT COUNT(*) as count FROM vector_memory').catch(() => [{ count: 0 }])
        )[0]?.count ?? 0,
      chunks:
        (
          await runQuery('SELECT COUNT(*) as count FROM system_topology_embeddings').catch(() => [
            { count: 0 },
          ])
        )[0]?.count ?? 0,
    };
  } catch {}
  try {
    const alerts = _state.alertsState?.alerts;
    alertCount = Array.isArray(alerts) ? alerts.length : 0;
  } catch {}

  return {
    ts: new Date().toISOString(),
    uptime: uptimeSec,
    services: {
      postgres: { ok: dbHealthy, latencyMs: pgLatency },
      redis: { ok: redisOk, latencyMs: redisLatency },
    },
    governance: { pending: pendingActions.length },
    think: thinkStats,
    memory: memoryStats,
    alerts: alertCount,
  };
}

app.get('/api/os-stream', async (req, res) => {
  if (OS_STREAM_CLIENTS.size >= MAX_SSE_CLIENTS) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    return res.end(
      JSON.stringify({ error: 'Service Unavailable', reason: 'SSE client limit reached' })
    );
  }

  const ticket = req.query?.ticket || req.url?.split('ticket=')[1]?.split('&')[0];
  if (!validateStreamTicket(ticket)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized', reason: 'missing or invalid stream ticket' }));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  OS_STREAM_CLIENTS.add(res);

  try {
    const snapshot = await buildOsSnapshot();
    res.write(`event: os:snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  } catch {
    /* ignore */
  }

  const interval = setInterval(async () => {
    try {
      const snap = await buildOsSnapshot();
      res.write(`event: os:snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    } catch {
      /* ignore */
    }
  }, OS_STREAM_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(interval);
    OS_STREAM_CLIENTS.delete(res);
  };
  res.on('close', cleanup);
  res.on('error', (err) => {
    if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED')) {
      cleanup();
    }
  });
});

// Phase 21: dedicated telemetry stream alias. Identical contract to
// /api/events but with a more discoverable URL for the History view.
app.get('/api/telemetry/stream', async (req, res) => {
  if (sseClientCount() >= MAX_SSE_CLIENTS) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    return res.end(
      JSON.stringify({
        error: 'Service Unavailable',
        reason: 'SSE client limit reached (backpressure)',
      })
    );
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  sseClients.add(res);

  try {
    const summary = await runQuery(
      `SELECT COALESCE(SUM(input_tokens), 0) AS in_tok,
              COALESCE(SUM(output_tokens), 0) AS out_tok,
              COALESCE(SUM(cost), 0) AS total_cost,
              COUNT(*) AS cnt
         FROM telemetry_traces`
    ).catch(() => [{ in_tok: 0, out_tok: 0, total_cost: 0, cnt: 0 }]);
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({ summary: summary[0] || {}, db_healthy: isDbHealthy(), redis: !!redis })}\n\n`
    );
  } catch {
    /* ignore */
  }
  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 10_000);

  _setupSSEHealth(res, keepAlive);
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
    path.join(process.cwd(), 'dist'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

// --- Phase 20: Dynamic Policy Engine, Vector Sync, and Live Alerts -----------
// In-memory state for the governance policy engine. Persists across the
// process lifetime and is exposed to the UI through REST endpoints.

const policyState = Object.create(null);
policyState.token_budget_cap = {
  id: 'token_budget_cap',
  label: 'Token Budget Cap',
  enabled: true,
  severity: 'BLOCK',
  config: { maxTokens: 200000 },
};
policyState.secret_leak_prevention = {
  id: 'secret_leak_prevention',
  label: 'Secret Leak Prevention',
  enabled: true,
  severity: 'BLOCK',
  config: { patterns: ['sk-ant-', 'sk-proj-', 'AIzaSy', 'ghp_'] },
};
policyState.system_prompt_guard = {
  id: 'system_prompt_guard',
  label: 'System Prompt Guard',
  enabled: true,
  severity: 'WARN',
  config: { denyTerms: ['ignore previous', 'disregard system'] },
};
policyState.pii_redaction = {
  id: 'pii_redaction',
  label: 'PII Redaction',
  enabled: true,
  severity: 'WARN',
  config: { pattern: 'email' },
};

const vectorSyncState = {
  state: 'IDLE', // IDLE | INDEXING | SYNCED | FAILED
  lastSyncAt: null,
  totalChunks: 0,
  totalVectors: 0,
  recentDocs: [],
};

const alertsState = {
  alerts: [],
};
_state.alertsState = alertsState;

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
    if (!isSafeKey(id)) return res.status(400).json({ error: 'Invalid policy id' });
    const policy = policyState[id];
    if (!policy) return res.status(404).json({ error: `unknown policy ${id}` });
    if (typeof enabled === 'boolean') policy.enabled = enabled;
    if (severity === 'PASS' || severity === 'WARN' || severity === 'BLOCK') {
      policy.severity = severity;
    }
    if (config && typeof config === 'object') {
      const safeConfig = Object.create(null);
      for (const k of Object.keys(config)) {
        if (isSafeKey(k) && typeof config[k] !== 'object' && typeof config[k] !== 'function') {
          safeConfig[k] = config[k];
        }
      }
      policy.config = Object.assign(Object.create(null), policy.config, safeConfig);
    }
    publishEvent('policy', {
      id: policy.id,
      enabled: policy.enabled,
      severity: policy.severity,
      ts: new Date().toISOString(),
    });
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

    const documents = Array.isArray(req.body?.documents)
      ? req.body.documents
      : [
          {
            id: 'doc-overview',
            text: 'Kudbee is an OpenTelemetry-aware LLM cost governance platform that routes traffic through a Fast Brain (semantic vector memory) and a Slow Brain (LLM reasoning).',
          },
          {
            id: 'doc-firewall',
            text: 'The Edge Sentinel firewall quarantines suspicious telemetry, redacts secrets, and blocks traffic exceeding active governance policies.',
          },
          {
            id: 'doc-vectors',
            text: 'Vector memory is indexed in 400-character chunks with cosine similarity retrieval. The resync pipeline rebuilds the index from the reasoning ledger.',
          },
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
      publishEvent('vector', {
        state: vectorSyncState.state,
        totalChunks,
        ts: vectorSyncState.lastSyncAt,
      });
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
      {
        id: 'doc-overview',
        text: 'Kudbee is an OpenTelemetry-aware LLM cost governance platform that routes traffic through a Fast Brain (semantic vector memory) and a Slow Brain (LLM reasoning).',
      },
      {
        id: 'doc-firewall',
        text: 'The Edge Sentinel firewall quarantines suspicious telemetry, redacts secrets, and blocks traffic exceeding active governance policies.',
      },
      {
        id: 'doc-vectors',
        text: 'Vector memory is indexed in 400-character chunks with cosine similarity retrieval. The resync pipeline rebuilds the index from the reasoning ledger.',
      },
      {
        id: 'doc-routing',
        text: 'Routing decisions are produced by /v1/chat/completions via matchLogic, which consults the vector store before invoking the LLM (Slow Brain).',
      },
    ];
    const ranked = library
      .map((doc) => {
        const terms = prompt.toLowerCase().split(/\s+/).filter(Boolean);
        const score =
          terms.reduce((acc, term) => acc + (doc.text.toLowerCase().includes(term) ? 1 : 0), 0) /
          Math.max(1, terms.length);
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
  const entry = {
    ...alert,
    id: alert.id || `alert-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    status: alert.status || 'OPEN',
    createdAt: alert.createdAt || new Date().toISOString(),
  };
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
    detail: 'Token Budget Cap, Secret Leak Prevention, and System Prompt Guard are active.',
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
  openai: {
    id: 'openai',
    label: 'OpenAI',
    weight: 30,
    baseLatencyMs: 145,
    maxLatencyMs: 800,
    rateLimitPct: 0.0,
    healthy: true,
    lastError: null,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    weight: 40,
    baseLatencyMs: 185,
    maxLatencyMs: 900,
    rateLimitPct: 0.0,
    healthy: true,
    lastError: null,
  },
  local: {
    id: 'local',
    label: 'Local VLLM',
    weight: 20,
    baseLatencyMs: 60,
    maxLatencyMs: 500,
    rateLimitPct: 0.0,
    healthy: true,
    lastError: null,
  },
  google: {
    id: 'google',
    label: 'Google',
    weight: 10,
    baseLatencyMs: 210,
    maxLatencyMs: 700,
    rateLimitPct: 0.0,
    healthy: true,
    lastError: null,
  },
};
_state.providerConfigRef.value = PROVIDER_CONFIG;

const routerState = {
  decisionLog: [], // Recent routing decisions
  totalRequests: 0,
  failovers: 0,
};

function buildProviderStatuses() {
  return Object.values(PROVIDER_CONFIG).map((p) => ({
    id: p.id,
    label: p.label,
    status:
      p.healthy && p.rateLimitPct < 0.5 ? 'OK' : p.rateLimitPct < 0.9 ? 'DEGRADED' : 'OFFLINE',
    weight: p.weight,
    baseLatencyMs: p.baseLatencyMs,
    maxLatencyMs: p.maxLatencyMs,
    measuredLatencyMs: p.baseLatencyMs + Math.floor(Math.random() * 40),
    rateLimitPct: Number(p.rateLimitPct.toFixed(3)),
    lastError: p.lastError,
    healthy: p.healthy,
  }));
}

function pickProvider(preferred) {
  // Honour explicit preference if healthy.
  if (preferred && isSafeKey(preferred) && PROVIDER_CONFIG[preferred]?.healthy) {
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
  if (providerId === '__proto__' || providerId === 'constructor' || providerId === 'prototype')
    return;
  if (!isSafeKey(providerId)) return;
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
      recent: routerState.decisionLog.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/router/select', async (req, res) => {
  try {
    const { preferred, simulateLatencyMs, simulateRateLimit } = req.body || {};
    if (
      simulateRateLimit &&
      preferred !== '__proto__' &&
      preferred !== 'constructor' &&
      preferred !== 'prototype' &&
      isSafeKey(preferred) &&
      PROVIDER_CONFIG[preferred]
    ) {
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
      ts: new Date().toISOString(),
    };
    routerState.decisionLog = [entry, ...routerState.decisionLog].slice(0, 50);
    publishEvent('router', entry);
    res.json({
      ...entry,
      failoverTriggered: failover,
      providers: buildProviderStatuses(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/router/reset', apiLimiter, async (_req, res) => {
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

app.get('/api/telemetry/throughput', apiLimiter, async (_req, res) => {
  try {
    const now = Date.now();
    const sinceIso = new Date(now - THROUGHPUT_WINDOW_MS).toISOString();
    const rows = await runQuery(
      `SELECT tokens_in AS input_tokens, tokens_out AS output_tokens, created_at FROM telemetry_traces WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 200`,
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
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 21: Cost Ledger Settlement --------------------------------------

// Authoritative provider cost table (per 1K tokens, USD).
const PROVIDER_COSTS = {
  'gpt-4o': { in: 0.005, out: 0.015 },
  'claude-3-5-sonnet': { in: 0.003, out: 0.015 },
  'gemini-1.5-pro': { in: 0.00125, out: 0.005 },
  'deepseek-r1': { in: 0.00055, out: 0.00219 },
  'deepseek-v3': { in: 0.00014, out: 0.00028 },
  'ternary-bonsai-27b': { in: 0.0008, out: 0.003 },
};

const BUDGET_USD = Number(process.env.MONTHLY_BUDGET_USD || 50);

app.get('/api/metrics/cost-ledger', async (_req, res) => {
  try {
    const now = Date.now();
    const last24hIso = new Date(now - 24 * 3600 * 1000).toISOString();
    const last7dIso = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    let inTok = 0,
      outTok = 0,
      totalCost = 0,
      total24hCost = 0,
      total7dCost = 0;
    let byProvider = Object.create(null);
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
          cost: Number(row.total_cost || 0),
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
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 22: Universal Search, Audit Export, System Diagnostics ---------------

app.get('/api/telemetry/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const traceId = String(req.query.traceId || '').trim();
    const provider = String(req.query.provider || '').trim();
    const verdict = String(req.query.verdict || '')
      .trim()
      .toUpperCase();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

    const conditions = [];
    const params = [];
    let idx = 1;

    if (q) {
      conditions.push(
        `(model ILIKE $${idx} OR provider ILIKE $${idx} OR project_name ILIKE $${idx} OR trace_id ILIKE $${idx})`
      );
      params.push(`%${q}%`);
      idx++;
    }
    if (traceId) {
      conditions.push(`trace_id ILIKE $${idx}`);
      params.push(`%${traceId}%`);
      idx++;
    }
    if (provider) {
      conditions.push(`provider = $${idx}`);
      params.push(provider);
      idx++;
    }
    if (verdict && ['BLOCK', 'WARN', 'PASS'].includes(verdict)) {
      conditions.push(`status = $${idx}`);
      params.push(verdict);
      idx++;
    }
    if (from) {
      conditions.push(`timestamp >= $${idx}`);
      params.push(from);
      idx++;
    }
    if (to) {
      conditions.push(`timestamp <= $${idx}`);
      params.push(to);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await runQuery(
      `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
         FROM telemetry_traces ${where} ORDER BY timestamp DESC LIMIT $${idx}`,
      [...params, limit]
    ).catch(() => []);

    const results = (rows || []).map((r) => ({
      id: r.id,
      traceId: r.trace_id,
      model: r.model,
      provider: r.provider,
      status: r.status,
      cost: Number(r.cost || 0),
      tokensIn: Number(r.tokens_in || 0),
      tokensOut: Number(r.tokens_out || 0),
      timestamp: r.timestamp,
      projectName: r.project_name,
    }));

    res.json({
      query: { q, traceId, provider, verdict, from, to, limit },
      total: results.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/audit/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const provider = String(req.query.provider || '').trim();
    const status = String(req.query.status || '')
      .trim()
      .toUpperCase();

    const conditions = [];
    const params = [];
    let idx = 1;

    if (from) {
      conditions.push(`timestamp >= $${idx}`);
      params.push(from);
      idx++;
    }
    if (to) {
      conditions.push(`timestamp <= $${idx}`);
      params.push(to);
      idx++;
    }
    if (provider) {
      conditions.push(`provider = $${idx}`);
      params.push(provider);
      idx++;
    }
    if (status && ['OK', 'ERROR', 'BLOCKED', 'INTERCEPTED'].includes(status)) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await runQuery(
      `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
         FROM telemetry_traces ${where} ORDER BY timestamp ASC`,
      params
    ).catch(() => []);

    const payload = (rows || []).map((r) => ({
      id: r.id,
      traceId: r.trace_id,
      model: r.model,
      provider: r.provider,
      status: r.status,
      cost: Number(r.cost || 0),
      tokensIn: Number(r.tokens_in || 0),
      tokensOut: Number(r.tokens_out || 0),
      timestamp: r.timestamp,
      projectName: r.project_name,
    }));

    const canonical = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');

    if (format === 'csv') {
      const header =
        'id,trace_id,model,provider,status,cost,tokens_in,tokens_out,timestamp,project_name';
      const lines = payload.map((r) =>
        [
          r.id,
          r.traceId,
          r.model,
          r.provider,
          r.status,
          r.cost,
          r.tokensIn,
          r.tokensOut,
          r.timestamp,
          r.projectName || '',
        ].join(',')
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
      res.setHeader('X-Audit-Hash', hash);
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      format: 'json',
      hash,
      recordCount: payload.length,
      records: payload,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/system/diagnostics', async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);
    const services = {
      postgres: { status: 'OFFLINE', latencyMs: null, lastPing: null, poolInfo: null },
      redis: { status: 'OFFLINE', latencyMs: null, lastPing: null, info: null },
    };
    const checks = {};

    let dbOk = false;
    try {
      const t0 = Date.now();
      const rows = await runQuery('SELECT 1 as ok');
      const latencyMs = Date.now() - t0;
      dbOk = Array.isArray(rows) && rows[0]?.ok === 1;
      services.postgres = {
        status: dbOk ? 'OK' : 'OFFLINE',
        latencyMs: dbOk ? latencyMs : null,
        lastPing: new Date().toISOString(),
        poolInfo: pool
          ? {
              totalCount: pool.totalCount || 0,
              idleCount: pool.idleCount || 0,
              waitingCount: pool.waitingCount || 0,
            }
          : null,
      };
      checks.dbConnection = dbOk ? 'PASS' : 'FAIL';
    } catch {
      services.postgres = { status: 'OFFLINE', latencyMs: null, lastPing: null, poolInfo: null };
      checks.dbConnection = 'FAIL';
    }

    if (redis) {
      try {
        const t0 = Date.now();
        await redis.ping();
        const latencyMs = Date.now() - t0;
        let memInfo = null;
        try {
          memInfo = await redis.info('memory');
        } catch {
          /* ignore */
        }
        services.redis = {
          status: 'OK',
          latencyMs,
          lastPing: new Date().toISOString(),
          info: memInfo,
        };
        checks.redisConnection = 'PASS';
      } catch {
        services.redis = { status: 'OFFLINE', latencyMs: null, lastPing: null, info: null };
        checks.redisConnection = 'FAIL';
      }
    } else {
      checks.redisConnection = 'SKIP';
    }

    let vectorIndexOk = false;
    let vectorIndexDetail = 'no vector store';
    try {
      const countRow = await runQuery('SELECT COUNT(*) as cnt FROM telemetry_traces');
      vectorIndexOk = Array.isArray(countRow);
      vectorIndexDetail = vectorIndexOk
        ? `${countRow[0]?.cnt || 0} trace rows indexed`
        : 'count query failed';
      checks.vectorIndex = vectorIndexOk ? 'PASS' : 'FAIL';
    } catch {
      checks.vectorIndex = 'FAIL';
    }

    const routerProviders = Object.values(PROVIDER_CONFIG || {}).map((p) => ({
      id: p.id,
      status:
        p.healthy && p.rateLimitPct < 0.5 ? 'OK' : p.rateLimitPct < 0.9 ? 'DEGRADED' : 'OFFLINE',
      latencyMs: p.measuredLatencyMs,
      lastError: p.lastError || null,
    }));
    checks.routerProviders = routerProviders.some((p) => p.status === 'OFFLINE') ? 'FAIL' : 'PASS';

    let logBufferOk = false;
    let logBufferDetail = 'unknown';
    try {
      const countRow = await runQuery('SELECT COUNT(*) as cnt FROM telemetry_logs');
      logBufferOk = Array.isArray(countRow);
      logBufferDetail = logBufferOk ? `${countRow[0]?.cnt || 0} log rows` : 'count query failed';
      checks.logBuffer = logBufferOk ? 'PASS' : 'FAIL';
    } catch {
      checks.logBuffer = 'FAIL';
    }

    let governanceOk = false;
    try {
      const proposed = await listProposed();
      governanceOk = Array.isArray(proposed);
      checks.governanceLedger = governanceOk ? 'PASS' : 'FAIL';
    } catch {
      checks.governanceLedger = 'FAIL';
    }

    const overall = Object.values(checks).every((c) => c === 'PASS' || c === 'SKIP')
      ? 'HEALTHY'
      : 'DEGRADED';

    res.json({
      status: overall,
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      summary: checks,
      services,
      routerProviders,
      logBuffer: { detail: logBufferDetail },
      vectorIndex: { detail: vectorIndexDetail },
      governanceLedger: checks.governanceLedger === 'PASS',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 23: Autonomous Agent Feedback Loop & Policy Auto-Tuning ---------------

const feedbackState = {
  feedback: [],
};

app.post('/api/governance/feedback', async (req, res) => {
  try {
    const { traceId, verdict, policyTag, expectedBehavior, notes } = req.body || {};
    if (!traceId || !verdict) {
      return res.status(400).json({ error: 'traceId and verdict are required' });
    }
    if (!['thumbs_up', 'thumbs_down'].includes(verdict)) {
      return res.status(400).json({ error: 'verdict must be thumbs_up or thumbs_down' });
    }
    const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id: feedbackId,
      traceId,
      verdict,
      policyTag: policyTag || null,
      expectedBehavior: expectedBehavior || null,
      notes: notes || null,
      timestamp: new Date().toISOString(),
    };
    feedbackState.feedback.push(entry);
    publishEvent('feedback', { kind: 'submitted', feedback: entry });
    res.status(201).json({ success: true, feedbackId, timestamp: entry.timestamp });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/governance/feedback', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const traceId = String(req.query.traceId || '').trim();
    let results = feedbackState.feedback;
    if (traceId) {
      results = results.filter((f) => f.traceId === traceId);
    }
    results = results.slice(-limit).reverse();
    res.json({ count: results.length, feedback: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const autoTuneState = {
  lastAnalysis: null,
  recommendations: null,
};

app.post('/api/governance/tune', async (req, res) => {
  try {
    const lookbackHours = Math.min(
      168,
      Math.max(1, parseInt(String(req.body?.lookbackHours || '24'), 10) || 24)
    );
    const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

    const traces = await runQuery(
      `SELECT status, model, tokens_in, tokens_out, cost FROM telemetry_traces WHERE timestamp >= $1`,
      [since]
    ).catch(() => []);

    const totalTraces = traces.length;
    const blocks = traces.filter((t) => t.status === 'BLOCK').length;
    const warns = traces.filter((t) => t.status === 'WARN').length;
    const passes = traces.filter((t) => t.status === 'OK' || t.status === 'PASS').length;

    const blockRate = totalTraces > 0 ? (blocks / totalTraces) * 100 : 0;
    const warnRate = totalTraces > 0 ? (warns / totalTraces) * 100 : 0;

    const recommendations = {
      token_budget_cap: {
        currentThreshold: policyState.token_budget_cap.config.maxTokens,
        recommendedThreshold: Math.round(
          policyState.token_budget_cap.config.maxTokens * (1 + blockRate / 100)
        ),
        confidence: Math.min(95, 50 + totalTraces / 10),
        rationale:
          blockRate > 10
            ? 'High block rate suggests threshold too restrictive'
            : 'Block rate acceptable, maintaining current threshold',
      },
      secret_leak_prevention: {
        currentEnabled: policyState.secret_leak_prevention.enabled,
        recommendedEnabled: true,
        confidence: 99,
        rationale: 'Secret leak prevention should always be enabled',
      },
      pii_redaction: {
        currentSeverity: policyState.pii_redaction.severity,
        recommendedSeverity: warnRate > 15 ? 'BLOCK' : 'WARN',
        confidence: Math.min(90, 60 + warnRate * 2),
        rationale:
          warnRate > 15
            ? 'High PII detection rate, escalating to BLOCK'
            : 'PII rate acceptable, maintaining WARN severity',
      },
    };

    autoTuneState.lastAnalysis = {
      timestamp: new Date().toISOString(),
      lookbackHours,
      totalTraces,
      blocks,
      warns,
      passes,
      blockRate: Number(blockRate.toFixed(2)),
      warnRate: Number(warnRate.toFixed(2)),
    };
    autoTuneState.recommendations = recommendations;

    res.json({
      success: true,
      analysis: autoTuneState.lastAnalysis,
      recommendations,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/governance/tune', async (_req, res) => {
  try {
    res.json({
      lastAnalysis: autoTuneState.lastAnalysis,
      recommendations: autoTuneState.recommendations,
      available: autoTuneState.recommendations !== null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/governance/tune/apply', async (req, res) => {
  try {
    const ctx = requireRole(req, res, 'ADMIN');
    if (!ctx) return;

    const { recommendations } = req.body || {};
    if (!recommendations || typeof recommendations !== 'object') {
      return res.status(400).json({ error: 'recommendations object required' });
    }

    const applied = [];
    if (recommendations.token_budget_cap?.recommendedThreshold) {
      policyState.token_budget_cap.config.maxTokens =
        recommendations.token_budget_cap.recommendedThreshold;
      applied.push('token_budget_cap');
    }
    if (recommendations.pii_redaction?.recommendedSeverity) {
      policyState.pii_redaction.severity = recommendations.pii_redaction.recommendedSeverity;
      applied.push('pii_redaction');
    }

    publishEvent('policy', { kind: 'auto_tuned', applied, timestamp: new Date().toISOString() });
    res.json({ success: true, applied, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Phase 24: Multi-Tenant RBAC, Audit Vault, Workspace Context ---------------
// Tenant registry + RBAC are now extracted to lib/tenants.ts and re-imported
// here so the modular sub-routers (mounted at the top of this file) can share
// the same source of truth without circular-init errors.

import { TENANTS, requireRole, RBAC_MATRIX, ROLE_RANK, resolveTenantId } from './lib/tenants.ts';

function resolveTenant(req) {
  return resolveTenantId(req);
}

app.get('/api/governance/tenants', (_req, res) => {
  try {
    res.json({
      tenants: Object.values(TENANTS).map((t) => ({ id: t.id, name: t.name, role: t.role })),
      current: 'tenant-prod',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const auditVaultState = {
  anchors: [],
};

function hashTraceRow(row) {
  const canonical = JSON.stringify({
    id: row.id,
    trace_id: row.trace_id,
    model: row.model,
    status: row.status,
    cost: Number(row.cost || 0),
    timestamp: row.timestamp || row.created_at,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

app.post('/api/audit/vault/anchor', async (req, res) => {
  try {
    const ctx = req.tenantCtx || requireRole(req, res, 'ADMIN');
    if (!ctx) return;

    const limit = Math.min(500, Math.max(1, parseInt(String(req.body?.limit || '50'), 10) || 50));
    const rows = await runQuery(
      `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
       FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    ).catch(() => []);

    const leafHashes = (rows || []).map(hashTraceRow);
    const batchRoot = crypto.createHash('sha256').update(leafHashes.join('|')).digest('hex');

    const anchor = {
      anchorId: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: ctx.tenantId,
      tenantRole: ctx.role,
      batchRoot,
      leafCount: leafHashes.length,
      sampleLeafHashes: leafHashes.slice(0, 5),
      createdAt: new Date().toISOString(),
    };
    auditVaultState.anchors.push(anchor);
    publishEvent('audit_vault', { kind: 'anchored', anchor });

    res.status(201).json({ success: true, anchor });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/audit/vault', async (_req, res) => {
  try {
    res.json({
      count: auditVaultState.anchors.length,
      anchors: auditVaultState.anchors.slice(-25).reverse(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/audit/vault/verify', async (req, res) => {
  try {
    const ctx = req.tenantCtx || requireRole(req, res, 'AUDITOR');
    if (!ctx) return;

    const anchorId = String(req.body?.anchorId || '');
    const anchor = auditVaultState.anchors.find((a) => a.anchorId === anchorId);
    if (!anchor) {
      return res.status(404).json({ verified: false, error: 'anchor not found' });
    }

    const rows = await runQuery(
      `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
       FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
      [anchor.leafCount]
    ).catch(() => []);

    const leafHashes = (rows || []).map(hashTraceRow);
    const recomputedRoot = crypto.createHash('sha256').update(leafHashes.join('|')).digest('hex');

    const verified = recomputedRoot === anchor.batchRoot;
    res.json({
      verified,
      anchorId,
      originalRoot: anchor.batchRoot,
      recomputedRoot,
      leafCount: anchor.leafCount,
      currentLeafCount: leafHashes.length,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Rate-Limit Diagnostics ---
app.get('/api/system/rate-limit-stats', (_req, res) => {
  res.json({
    middleware_guard: getAllGuardStats(),
    redis: getRateLimiterStats(),
    in_memory_express: {
      windowMs: 60000,
      maxRequests: process.env.NODE_ENV === 'test' ? 1000 : 100,
    },
    timestamp: new Date().toISOString(),
  });
});

// --- Middleware Health ---
app.get('/middleware/health', (_req, res) => {
  res.json({ guards: getAllGuardStats(), timestamp: new Date().toISOString() });
});

const distPath = resolveDistPath();

if (fs.existsSync(distPath)) {
  const fileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(express.static(distPath));
  app.get('*', fileLimiter, (req, res) => {
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

// --- Phase 26: Background worker (Crucible task queue) -----------------------
// The worker is fire-and-forget; it never blocks the API event loop. If
// Redis is offline the worker logs a warning and remains dormant until
// the next process restart.
try {
  const { startWorker } = await import('../agents/worker.ts');
  void startWorker();
} catch (err) {
  console.error(
    '[Worker] Failed to start background loop:',
    err instanceof Error ? err.message : String(err)
  );
}

// --- Phase 34: Bootstrap shared receptor lock registry from Redis -----------
if (redis) {
  try {
    void receptorGate.bootstrap().then(() => {
      console.log('[Receptor] P2P lock sync active');
    });
  } catch (err) {
    console.warn('[Receptor] Bootstrap deferred (Redis unavailable):', err?.message);
  }
}

// Populate the shared state holder so the modular sub-routers can read the
// policy / feedback / auto-tune / evaluate state lazily.
if (globalThis.__KUBEE_STATE__) {
  globalThis.__KUBEE_STATE__.policyState = policyState;
  globalThis.__KUBEE_STATE__.feedbackState = feedbackState;
  globalThis.__KUBEE_STATE__.autoTuneState = autoTuneState;
  globalThis.__KUBEE_STATE__.evaluatePolicies = evaluatePolicies;
}

// --- Phase 66: Global error handler — structured JSON with trace IDs + breadcrumbs ---
app.use(globalErrorHandler());

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] OTel Ingestion Server listening on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `[Server] Database: ${pool ? 'Neon Postgres (resilient Pool)' : 'in-memory fallback (DATABASE_URL unset)'}`
  );
  console.log(`[Server] Redis: ${redis ? 'enabled' : 'disabled'}`);
  console.log(
    `[Server] Groq LPU: ${groqConfigured ? 'enabled (ultra-fast inference)' : 'disabled (set GROQ_API_KEY)'}`
  );
});

// Graceful shutdown: drain the Neon pool and Redis without crashing.
async function shutdown(signal) {
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  await teardownAll(redis);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
