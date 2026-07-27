/**
 * services/ingestion/routes/system.ts
 * ---------------------------------------------------------------------------
 * System sub-router: health probes, deep diagnostics, and live alert
 * orchestration. Mounted under /api/system.
 *
 * Endpoints included:
 *   GET /health-deep   — deep dependency latency probes
 *   GET /diagnostics   — full system diagnostics rollup
 *   GET /alerts        — list active alerts
 *   POST /alerts/:id/ack       — acknowledge an alert
 *   POST /alerts/:id/mitigate  — mitigate an alert
 * ---------------------------------------------------------------------------
 */

import express from 'express';

type Deps = {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
  isDbHealthy: () => boolean;
  publishEvent: (type: string, data: unknown) => void;
  listProposed: () => Promise<any[]>;
  getBootTime: () => number;
  getRedis: () => any;
  getPool: () => any;
  getProviderConfig: () => Record<string, any>;
  getAlertsState: () => { alerts: any[] };
  getRouteLatencies: () => Record<string, any>;
  getMiddlewareStats: () => Array<{ name: string; healthy: boolean; state: string; failureCount: number; successCount: number; bypassedCount: number; lastFailureAt: string | null; cooldownUntil: string | null }>;
};

export function createSystemRouter({ runQuery, isDbHealthy, publishEvent, listProposed, getBootTime, getRedis, getPool, getProviderConfig, getAlertsState, getRouteLatencies, getMiddlewareStats }: Deps) {
  const router = express.Router();

  router.get('/health-deep', async (_req, res) => {
    try {
      const BOOT_TIME = getBootTime();
      const redis = getRedis();
      const pool = getPool();
      const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);
      const services: Record<string, any> = {
        postgres: { status: 'OFFLINE', latencyMs: null, lastPing: null },
        redis: { status: 'OFFLINE', latencyMs: null, lastPing: null }
      };
      const checks: Record<string, string> = {};
      let dbOk = false;
      try {
        const t0 = Date.now();
        const rows = await runQuery('SELECT 1 as ok');
        const latencyMs = Date.now() - t0;
        // `runQuery` transparently falls back to an in-memory store when the pool
        // is unhealthy, and that fallback hardcodes `SELECT 1 as ok` -> [{ok:1}].
        // Gate on isDbHealthy() so a fully-degraded server reports OFFLINE
        // instead of a false-positive OK (which masked missing Control Tower data).
        dbOk = isDbHealthy() && Array.isArray(rows) && rows[0]?.ok === 1;
        services.postgres = {
          status: dbOk ? 'OK' : 'OFFLINE',
          latencyMs: dbOk ? latencyMs : null,
          lastPing: new Date().toISOString()
        };
        checks.dbConnection = dbOk ? 'PASS' : 'FAIL';
      } catch {
        services.postgres = { status: 'OFFLINE', latencyMs: null, lastPing: null };
        checks.dbConnection = 'FAIL';
      }

      if (redis) {
        try {
          const t0 = Date.now();
          await redis.ping();
          services.redis = { status: 'OK', latencyMs: Date.now() - t0, lastPing: new Date().toISOString() };
          checks.redisConnection = 'PASS';
        } catch {
          services.redis = { status: 'OFFLINE', latencyMs: null, lastPing: null };
          checks.redisConnection = 'FAIL';
        }
      } else {
        checks.redisConnection = 'SKIP';
      }

      const overall = Object.values(checks).every((c) => c === 'PASS' || c === 'SKIP') ? 'HEALTHY' : 'DEGRADED';
      res.json({
        status: overall,
        timestamp: new Date().toISOString(),
        uptimeSeconds: uptimeSec,
        services,
        agent: {
          status: 'ACTIVE_RUNNING',
          uptimeSeconds: uptimeSec,
          pendingTriageCount: 0
        }
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/alerts', async (_req, res) => {
    try {
      const alertsState = getAlertsState();
      res.json(alertsState.alerts);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/route-latencies', async (_req, res) => {
    try {
      const latencies = getRouteLatencies();
      const middlewareStats = getMiddlewareStats();
      res.json({
        timestamp: new Date().toISOString(),
        routes: latencies,
        middleware: middlewareStats.map((s) => ({
          name: s.name,
          healthy: s.healthy,
          state: s.state,
          failures: s.failureCount,
          successes: s.successCount,
          bypassed: s.bypassedCount,
          lastFailure: s.lastFailureAt,
          cooldownUntil: s.cooldownUntil,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/agent-status', async (_req, res) => {
    try {
      const { execSync } = await import('node:child_process');
      const result = execSync('node scripts/agent-bridge.mjs state', {
        cwd: process.cwd(),
        timeout: 5000,
        encoding: 'utf8',
      });
      const state = JSON.parse(result);
      res.json(state);
    } catch (err) {
      res.status(500).json({
        error: 'agent_status_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
