/**
 * services/ingestion/routes/telemetry.ts
 * ---------------------------------------------------------------------------
 * Telemetry sub-router: ingest, search, throughput, and stream endpoints.
 * Mounted under /api/telemetry.
 *
 * Endpoints included:
 *   GET  /logs        — paginated telemetry log fetch
 *   GET  /search      — universal cross-panel search
 *   GET  /throughput  — rolling throughput stats
 * ---------------------------------------------------------------------------
 */

import express from 'express';

type Deps = {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
};

export function createTelemetryRouter({ runQuery }: Deps) {
  const router = express.Router();

  router.get('/logs', async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const rows = await runQuery(
        `SELECT * FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      );
      return res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const traceId = String(req.query.traceId || '').trim();
      const provider = String(req.query.provider || '').trim();
      const verdict = String(req.query.verdict || '').trim().toUpperCase();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

      const conditions = [];
      const params = [];
      let idx = 1;

      if (q) {
        conditions.push(`(model ILIKE $${idx} OR provider ILIKE $${idx} OR project_name ILIKE $${idx} OR trace_id ILIKE $${idx})`);
        params.push(`%${q}%`);
        idx++;
      }
      if (traceId) { conditions.push(`trace_id ILIKE $${idx}`); params.push(`%${traceId}%`); idx++; }
      if (provider) { conditions.push(`provider = $${idx}`); params.push(provider); idx++; }
      if (verdict && ['BLOCK', 'WARN', 'PASS'].includes(verdict)) {
        conditions.push(`status = $${idx}`); params.push(verdict); idx++;
      }
      if (from) { conditions.push(`timestamp >= $${idx}`); params.push(from); idx++; }
      if (to) { conditions.push(`timestamp <= $${idx}`); params.push(to); idx++; }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await runQuery(
        `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
         FROM telemetry_traces ${where} ORDER BY timestamp DESC LIMIT $${idx}`,
        [...params, limit]
      ).catch(() => []);

      const results = (rows || []).map((r: any) => ({
        id: r.id,
        traceId: r.trace_id,
        model: r.model,
        provider: r.provider,
        status: r.status,
        cost: Number(r.cost || 0),
        tokensIn: Number(r.tokens_in || 0),
        tokensOut: Number(r.tokens_out || 0),
        timestamp: r.timestamp,
        projectName: r.project_name
      }));

      res.json({ query: { q, traceId, provider, verdict, from, to, limit }, total: results.length, results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
