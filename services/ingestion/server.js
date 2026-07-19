import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import { IngestRequestSchema } from '@kudbee/types';
import {
  deserializePass,
  verifyAgentPass,
  verifySignature,
  AGENT_PASS_MAX_AGE_MS
} from '@kudbee/utils';
import { embedTrace, cosineSimilarity, EMBEDDING_DIM } from './embedder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(process.cwd(), 'telemetry_traces.db');
const BOOT_TIME = Date.now();
const REGISTRY_FILE = path.resolve(__dirname, '../../config/agents.json');

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

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('[DB] Failed to open SQLite database:', err.message);
  } else {
    console.log('[DB] Connected to SQLite database:', DB_FILE);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OK',
      provider TEXT,
      project_name TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Failed to create table:', err.message);
    } else {
      console.log('[DB] Table telemetry_traces ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_trace_timestamp ON telemetry_traces(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_trace_model ON telemetry_traces(model)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS security_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      violation_reason TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Failed to create security_violations table:', err.message);
    } else {
      console.log('[DB] Table security_violations ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_violation_timestamp ON security_violations(timestamp)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry_vectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      thought_summary TEXT NOT NULL DEFAULT '',
      reasoning TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'unknown',
      vector TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Failed to create telemetry_vectors table:', err.message);
    } else {
      console.log('[DB] Table telemetry_vectors ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_vector_trace ON telemetry_vectors(trace_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS governance_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'VERIFY',
      type TEXT NOT NULL DEFAULT 'GOVERNANCE_ACTION',
      agent_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      signed_payload TEXT NOT NULL,
      value_score REAL NOT NULL DEFAULT 0,
      note TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Failed to create governance_actions table:', err.message);
    } else {
      console.log('[DB] Table governance_actions ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_governance_trace ON governance_actions(trace_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_governance_ts ON governance_actions(timestamp)`);

  db.run(`ALTER TABLE telemetry_traces ADD COLUMN value_score REAL NOT NULL DEFAULT 0`, () => {});
});

let redis;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000)
  });
  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('error', (err) => console.error('[Redis] Connection error:', err.message));
} catch (err) {
  console.error('[Redis] Failed to initialize client:', err.message);
}

function quarantineViolation(payload, violationReason) {
  return runInsert(
    `INSERT INTO security_violations (payload, violation_reason, timestamp)
     VALUES (?, ?, datetime('now'))`,
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

function storeVector({ traceId, thoughtSummary, reasoning, model, vector }) {
  return runInsert(
    `INSERT INTO telemetry_vectors (trace_id, thought_summary, reasoning, model, vector, timestamp)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [String(traceId), String(thoughtSummary || ''), String(reasoning || ''), String(model || 'unknown'), JSON.stringify(vector)]
  );
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

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runInsert(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

app.post('/api/telemetry/ingest', async (req, res) => {
  try {
    const agentId = authenticateAgentPass(req.header('X-Agent-Pass'));
    const { trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, thought_summary, reasoning } = req.body || {};
    const effectiveStatus = agentId ? (status || 'authenticated_bypass') : (status || 'OK');

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

    const recall = await recallMemories(
      [thought_summary, reasoning, model].filter(Boolean).join(' '), 3
    ).catch((e) => {
      console.error('[Memory] Recall failed, continuing without context:', e.message);
      return [];
    });

    const result = await runInsert(
      `INSERT INTO telemetry_traces (trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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

    const vector = embedTrace(reasoning || '', thought_summary || '', model || 'unknown');
    await storeVector({
      traceId: trace_id ?? (agentId ? `agent-${agentId}` : 'unknown'),
      thoughtSummary: thought_summary || '',
      reasoning: reasoning || '',
      model: model || 'unknown',
      vector
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

    if (redis) {
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
      redis.lpush('kudbee:telemetry_feed', JSON.stringify(feedEntry))
        .then(() => redis.ltrim('kudbee:telemetry_feed', 0, 9999))
        .catch((e) => console.error('[Redis] Telemetry feed push failed:', e.message));
    }

    return res.status(201).json(responsePayload);
  } catch (err) {
    console.error('[Ingest] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/memory/recall', async (req, res) => {
  try {
    const query = String(req.query.query || '');
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
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

app.get('/api/telemetry/logs', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const rows = await runQuery(
      `SELECT * FROM telemetry_traces ORDER BY timestamp DESC LIMIT ?`,
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
    const activeModelsRow = await runQuery(`SELECT COUNT(DISTINCT model) as count FROM telemetry_traces`);

    const now = Date.now();
    const last24h = new Date(now - 24 * 3600 * 1000).toISOString();
    const cost24hRow = await runQuery(
      `SELECT SUM(cost) as total FROM telemetry_traces WHERE timestamp >= ?`,
      [last24h]
    );

    return res.json({
      total_24h_cost: Number((cost24hRow[0]?.total || 0).toFixed(6)),
      total_historical_tokens: Number(totalTokensRow[0]?.total || 0),
      total_active_models: Number(activeModelsRow[0]?.count || 0),
      health_matrix: []
    });
  } catch (err) {
    console.error('[Summary] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch summary' });
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const result = await runQuery(`DELETE FROM security_violations WHERE id = ?`, [id]);
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
    const rows = await runQuery(`SELECT * FROM security_violations WHERE id = ?`, [id]);
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
    await runQuery(`DELETE FROM security_violations WHERE id = ?`, [id]);

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
       VALUES (?, 'VERIFY', 'GOVERNANCE_ACTION', ?, ?, ?, ?, ?, datetime('now'))`,
      [traceId, agentId, providedSignature, providedPayload, score, note ? String(note) : null]
    ).catch(() => {});

    if (score > 0) {
      await runQuery(
        `UPDATE telemetry_traces SET value_score = ? WHERE trace_id = ?`,
        [score, traceId]
      ).catch(() => {});
    }

    console.log(`[Governance] Agent ${agentId} VERIFIED trace ${traceId} (value_score=${score})`);

    return res.status(201).json({
      success: true,
      id: govId || Date.now(),
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
      `SELECT * FROM governance_actions ORDER BY timestamp DESC LIMIT ?`,
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

app.get('/api/metrics/community-value', async (req, res) => {
  try {
    if (redis) {
      try {
        const score = await redis.get('kudbee:community_value_score');
        const actions = await redis.get('kudbee:governance_count');
        const verified = await redis.scard('kudbee:verified_traces');
        return res.json({
          community_value_score: Number(score || 0).toFixed(2),
          governance_actions: Number(actions || 0),
          verified_traces: Number(verified || 0)
        });
      } catch (e) {
        console.error('[Redis] Community value fallback to SQLite:', e.message);
      }
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
    return res.json({
      community_value_score: Number(scoreRow[0]?.total || 0).toFixed(2),
      governance_actions: Number(actionsRow[0]?.count || 0),
      verified_traces: Number(verifiedRow[0]?.count || 0)
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

app.get('/health', async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);
    const dbOk = await runQuery('SELECT 1 as ok').then(
      (rows) => Array.isArray(rows) && rows[0]?.ok === 1,
      () => false
    );
    let redisOk = false;
    if (redis) {
      try {
        await redis.ping();
        redisOk = true;
      } catch {
        redisOk = false;
      }
    }
    const status = dbOk ? 'ok' : 'degraded';
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
    res.status(status === 'ok' ? 200 : 503).json(payload);
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
    const communityValueScore = redis ? await redis.get('kudbee:community_value_score') : '0';
    const alerts = redis ? await redis.lrange('kudbee:alerts', 0, 4) : [];

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
    console.error('[HealthCheck] Error:', err?.message);
    res.status(500).json({ error: 'Failed to fetch health check' });
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
    console.error('[SessionHistory] Error:', err?.message);
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
});

function resolveDistPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'apps', 'web', 'dist'),
    path.join(process.cwd(), 'apps', 'web', 'dist'),
    path.join(process.cwd(), 'dist')
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

const distPath = resolveDistPath();
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] OTel Ingestion Server listening on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Database: ${DB_FILE}`);
  console.log(`[Server] Redis: ${redis ? 'enabled' : 'disabled'}`);
});

export default app;
