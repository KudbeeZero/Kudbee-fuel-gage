/**
 * services/ingestion/routes/governance.ts
 * ---------------------------------------------------------------------------
 * Governance sub-router: tenant registry, policy engine CRUD, agent feedback
 * loop, and policy threshold auto-tuning.
 *
 * Routes included (mounted under /api/governance):
 *   GET    /tenants               — list tenants
 *   GET    /policies              — list active policy engine
 *   POST   /policies              — update policy
 *   POST   /policies/evaluate     — run evaluation probe
 *   POST   /feedback              — submit trace feedback
 *   GET    /feedback              — list feedback entries
 *   POST   /tune                  — run auto-tune analysis
 *   GET    /tune                  — retrieve last analysis
 *   POST   /tune/apply            — apply recommended thresholds (ADMIN)
 *
 * State is read lazily via getter functions to avoid "Cannot access X before
 * initialization" when the router is mounted before server.js finishes its
 * top-level state declarations.
 * ---------------------------------------------------------------------------
 */

import express from 'express';
import { TENANTS } from '../lib/tenants.ts';

type Deps = {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
  publishEvent: (type: string, data: unknown) => void;
  requireRole: (req: any, res: any, role: string) => any;
  getPolicyState: () => Record<string, any>;
  getFeedbackState: () => { feedback: any[] };
  getAutoTuneState: () => { lastAnalysis: any; recommendations: any };
  getEvaluatePolicies: () => (prompt: string) => { overall: string; results: any[] };
};

export function createGovernanceRouter({ runQuery, publishEvent, requireRole, getPolicyState, getFeedbackState, getAutoTuneState, getEvaluatePolicies }: Deps) {
  const router = express.Router();

  router.get('/tenants', (_req, res) => {
    try {
      res.json({
        tenants: Object.values(TENANTS).map((t) => ({ id: t.id, name: t.name, role: t.role })),
        current: 'tenant-prod'
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/policies', async (_req, res) => {
    try {
      const policyState = getPolicyState();
      res.json({ policies: Object.values(policyState) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/policies', async (req, res) => {
    try {
      const policyState = getPolicyState();
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

  router.post('/policies/evaluate', async (req, res) => {
    try {
      const evaluatePolicies = getEvaluatePolicies();
      const prompt = req.body?.prompt || req.body?.messages?.map((m: any) => m.content).join(' ') || '';
      res.json(evaluatePolicies(prompt));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/feedback', async (req, res) => {
    try {
      const feedbackState = getFeedbackState();
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
        timestamp: new Date().toISOString()
      };
      feedbackState.feedback.push(entry);
      publishEvent('feedback', { kind: 'submitted', feedback: entry });
      res.status(201).json({ success: true, feedbackId, timestamp: entry.timestamp });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/feedback', async (req, res) => {
    try {
      const feedbackState = getFeedbackState();
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

  router.post('/tune', async (req, res) => {
    try {
      const policyState = getPolicyState();
      const autoTuneState = getAutoTuneState();
      const lookbackHours = Math.min(168, Math.max(1, parseInt(String(req.body?.lookbackHours || '24'), 10) || 24));
      const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

      const traces = await runQuery(
        `SELECT status, model, tokens_in, tokens_out, cost FROM telemetry_traces WHERE timestamp >= $1`,
        [since]
      ).catch((e) => { console.warn('[Governance] Failed to fetch traces for tuning:', e instanceof Error ? e.message : String(e)); return []; });

      const totalTraces = traces.length;
      const blocks = traces.filter((t: any) => t.status === 'BLOCK').length;
      const warns = traces.filter((t: any) => t.status === 'WARN').length;

      const blockRate = totalTraces > 0 ? (blocks / totalTraces) * 100 : 0;
      const warnRate = totalTraces > 0 ? (warns / totalTraces) * 100 : 0;

      const recommendations = {
        token_budget_cap: {
          currentThreshold: policyState.token_budget_cap.config.maxTokens,
          recommendedThreshold: Math.round(policyState.token_budget_cap.config.maxTokens * (1 + (blockRate / 100))),
          confidence: Math.min(95, 50 + (totalTraces / 10)),
          rationale: blockRate > 10 ? 'High block rate suggests threshold too restrictive' : 'Block rate acceptable, maintaining current threshold'
        },
        secret_leak_prevention: {
          currentEnabled: policyState.secret_leak_prevention.enabled,
          recommendedEnabled: true,
          confidence: 99,
          rationale: 'Secret leak prevention should always be enabled'
        },
        pii_redaction: {
          currentSeverity: policyState.pii_redaction.severity,
          recommendedSeverity: warnRate > 15 ? 'BLOCK' : 'WARN',
          confidence: Math.min(90, 60 + (warnRate * 2)),
          rationale: warnRate > 15 ? 'High PII detection rate, escalating to BLOCK' : 'PII rate acceptable, maintaining WARN severity'
        }
      };

      autoTuneState.lastAnalysis = {
        timestamp: new Date().toISOString(),
        lookbackHours,
        totalTraces,
        blocks,
        warns,
        blockRate: Number(blockRate.toFixed(2)),
        warnRate: Number(warnRate.toFixed(2))
      };
      autoTuneState.recommendations = recommendations;

      res.json({
        success: true,
        analysis: autoTuneState.lastAnalysis,
        recommendations,
        generatedAt: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/tune', async (_req, res) => {
    try {
      const autoTuneState = getAutoTuneState();
      res.json({
        lastAnalysis: autoTuneState.lastAnalysis,
        recommendations: autoTuneState.recommendations,
        available: autoTuneState.recommendations !== null
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/tune/apply', async (req, res) => {
    try {
      const policyState = getPolicyState();
      const ctx = requireRole(req, res, 'ADMIN');
      if (!ctx) return;

      const { recommendations } = req.body || {};
      if (!recommendations || typeof recommendations !== 'object') {
        return res.status(400).json({ error: 'recommendations object required' });
      }

      const applied: string[] = [];
      if (recommendations.token_budget_cap?.recommendedThreshold) {
        policyState.token_budget_cap.config.maxTokens = recommendations.token_budget_cap.recommendedThreshold;
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

  // --- Phase 26: Background task queue & DLQ endpoints ---------------------

  router.post('/tasks/enqueue', async (req, res) => {
    try {
      const { enqueueTask, isAvailable: workerAvailable } = await import('../../agents/worker.ts');
      if (!workerAvailable()) {
        return res.status(503).json({ error: 'background worker unavailable (Redis offline)' });
      }
      const result = await enqueueTask(req.body || {});
      if (!result.success) {
        return res.status(503).json({ error: result.error || 'enqueue failed' });
      }
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/failed', async (_req, res) => {
    try {
      const { listFailed, getDlqName, isRunning } = await import('../../agents/worker.ts');
      const items = await listFailed();
      res.json({
        dlq: getDlqName(),
        workerRunning: isRunning(),
        count: items.length,
        items
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/failed/retry', async (req, res) => {
    try {
      const ctx = requireRole(req, res, 'OPERATOR');
      if (!ctx) return;
      const { retryFailed } = await import('../../agents/worker.ts');
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'id required' });
      const result = await retryFailed(id);
      if (!result.success) return res.status(404).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/failed/discard', async (req, res) => {
    try {
      const ctx = requireRole(req, res, 'ADMIN');
      if (!ctx) return;
      const { discardFailed } = await import('../../agents/worker.ts');
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'id required' });
      const result = await discardFailed(id);
      if (!result.success) return res.status(404).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
