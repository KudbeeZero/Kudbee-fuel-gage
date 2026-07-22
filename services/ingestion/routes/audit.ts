/**
 * services/ingestion/routes/audit.ts (compiled to .js)
 * ---------------------------------------------------------------------------
 * Audit sub-router: extracts /api/audit/* handlers from the monolithic
 * server.js into a self-contained, factory-injected module.
 *
 * Pattern: each sub-router exports a `createAuditRouter(deps)` factory
 * that takes the shared infrastructure (runQuery, publishEvent, crypto,
 * requireRole) so we avoid circular imports and keep the route surface
 * 100% behavior-compatible with the prior inline definitions.
 *
 * Endpoints:
 *   GET  /api/audit/export           (AUDITOR)  — CSV/JSON export w/ SHA-256 hash
 *   GET  /api/audit/vault            (public)   — list recent vault anchors
 *   POST /api/audit/vault/anchor     (ADMIN)    — create a new vault anchor
 *   POST /api/audit/vault/verify     (AUDITOR)  — recompute & verify a chain root
 * ---------------------------------------------------------------------------
 */

import express from 'express';
import crypto from 'crypto';

type Deps = {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
  publishEvent: (type: string, data: unknown) => void;
  requireRole: (req: any, res: any, role: string) => any;
};

export function createAuditRouter({ runQuery, publishEvent, requireRole }: Deps) {
  const router = express.Router();
  const auditVaultState: { anchors: any[] } = { anchors: [] };

  function hashTraceRow(row: any) {
    const canonical = JSON.stringify({
      id: row.id,
      trace_id: row.trace_id,
      model: row.model,
      status: row.status,
      cost: Number(row.cost || 0),
      timestamp: row.timestamp || row.created_at
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  router.get('/export', async (req, res) => {
    try {
      const format = String(req.query.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const provider = String(req.query.provider || '').trim();
      const status = String(req.query.status || '').trim().toUpperCase();

      const conditions = [];
      const params = [];
      let idx = 1;

      if (from) { conditions.push(`timestamp >= $${idx}`); params.push(from); idx++; }
      if (to) { conditions.push(`timestamp <= $${idx}`); params.push(to); idx++; }
      if (provider) { conditions.push(`provider = $${idx}`); params.push(provider); idx++; }
      if (status && ['OK', 'ERROR', 'BLOCKED', 'INTERCEPTED'].includes(status)) {
        conditions.push(`status = $${idx}`); params.push(status); idx++;
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
        projectName: r.project_name
      }));

      const canonical = JSON.stringify(payload);
      const hash = crypto.createHash('sha256').update(canonical).digest('hex');

      if (format === 'csv') {
        const header = 'id,trace_id,model,provider,status,cost,tokens_in,tokens_out,timestamp,project_name';
        const lines = payload.map((r) =>
          [r.id, r.traceId, r.model, r.provider, r.status, r.cost, r.tokensIn, r.tokensOut, r.timestamp, r.projectName || ''].join(',')
        );
        const csv = [header, ...lines].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
        res.setHeader('X-Audit-Hash', hash);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
      res.json({ exportedAt: new Date().toISOString(), format: 'json', hash, recordCount: payload.length, records: payload });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/vault', async (_req, res) => {
    try {
      res.json({
        count: auditVaultState.anchors.length,
        anchors: auditVaultState.anchors.slice(-25).reverse()
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/vault/anchor', async (req, res) => {
    try {
      const ctx = (req as any).tenantCtx || requireRole(req, res, 'ADMIN');
      if (!ctx) return;

      const limit = Math.min(500, Math.max(1, parseInt(String(req.body?.limit || '50'), 10) || 50));
      const rows = await runQuery(
        `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
         FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      ).catch(() => []);

      const leafHashes = (rows || []).map(hashTraceRow);
      const batchRoot = crypto
        .createHash('sha256')
        .update(leafHashes.join('|'))
        .digest('hex');

      const anchor: any = {
        anchorId: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: ctx.tenantId,
        tenantRole: ctx.role,
        batchRoot,
        leafCount: leafHashes.length,
        sampleLeafHashes: leafHashes.slice(0, 5),
        createdAt: new Date().toISOString()
      };
      auditVaultState.anchors.push(anchor);
      publishEvent('audit_vault', { kind: 'anchored', anchor });

      res.status(201).json({ success: true, anchor });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/vault/verify', async (req, res) => {
    try {
      const ctx = (req as any).tenantCtx || requireRole(req, res, 'AUDITOR');
      if (!ctx) return;

      const anchorId = String(req.body?.anchorId || '');
      const anchor: any = auditVaultState.anchors.find((a) => a.anchorId === anchorId);
      if (!anchor) {
        return res.status(404).json({ verified: false, error: 'anchor not found' });
      }

      const rows = await runQuery(
        `SELECT id, trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name, timestamp
         FROM telemetry_traces ORDER BY timestamp DESC LIMIT $1`,
        [anchor.leafCount]
      ).catch(() => []);

      const leafHashes = (rows || []).map(hashTraceRow);
      const recomputedRoot = crypto
        .createHash('sha256')
        .update(leafHashes.join('|'))
        .digest('hex');

      const verified = recomputedRoot === anchor.batchRoot;
      res.json({
        verified,
        anchorId,
        originalRoot: anchor.batchRoot,
        recomputedRoot,
        leafCount: anchor.leafCount,
        currentLeafCount: leafHashes.length,
        verifiedAt: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
