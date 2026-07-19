import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(process.cwd(), 'telemetry_traces.db');

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
});

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
    const { trace_id, model, tokens_in, tokens_out, cost, status } = req.body;

    if (!trace_id || !model || tokens_in === undefined || tokens_out === undefined || cost === undefined) {
      return res.status(400).json({ error: 'Missing required fields: trace_id, model, tokens_in, tokens_out, cost' });
    }

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
        String(req.body.provider || 'unknown'),
        String(req.body.project_name || 'kilo-fuel-gauge')
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
