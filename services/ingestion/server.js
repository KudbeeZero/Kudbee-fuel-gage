import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { IngestRequestSchema } from '@kudbee/types';
import {
  deserializePass,
  verifyAgentPass,
  AGENT_PASS_MAX_AGE_MS
} from '@kudbee/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(process.cwd(), 'telemetry_traces.db');
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

function authenticateAgentPass(headerValue) {
  if (!headerValue) return null;
  const pass = deserializePass(headerValue);
  if (!pass) return null;
  const publicKey = AGENT_REGISTRY.get(pass.agentId);
  if (!publicKey) return null;
  return verifyAgentPass(pass, publicKey, AGENT_PASS_MAX_AGE_MS) ? pass.agentId : null;
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
});

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
    if (agentId) {
      const { trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name } = req.body || {};
      const result = await runInsert(
        `INSERT INTO telemetry_traces (trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          String(trace_id ?? `agent-${agentId}`),
          String(model || 'unknown'),
          Number(tokens_in) || 0,
          Number(tokens_out) || 0,
          Number(cost) || 0,
          String(status || 'authenticated_bypass'),
          String(provider || 'unknown'),
          String(project_name || 'kilo-fuel-gauge')
        ]
      );
      console.log(`[Identity] Fast-path bypass granted for agent ${agentId} (trace ${result.id})`);
      return res.status(201).json({
        success: true,
        id: result.id,
        agent: agentId,
        bypass: true,
        message: 'Telemetry trace ingested via authenticated agent fast-path'
      });
    }

    const parsed = IngestRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      await quarantineViolation(req.body, reason);
      return res.status(422).json({ error: 'Firewall: invalid telemetry contract', issues: parsed.error.issues });
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

    return res.status(201).json({
      success: true,
      id: result.id,
      message: 'Telemetry trace ingested successfully'
    });
  } catch (err) {
    console.error('[Ingest] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
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

const distPath = path.join(process.cwd(), 'dist');
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
});

export default app;
