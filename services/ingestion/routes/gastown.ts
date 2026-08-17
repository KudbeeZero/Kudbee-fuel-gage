// services/ingestion/routes/gastown.ts
// ---------------------------------------------------------------------------
// Gas Town domain: convoy lifecycle metrics + the live dashboard KPI endpoint.
//
// The convoy state machine and DB metrics live in services/agent/gastown-convoy.ts;
// this module only wires them into Express (bearer-auth gated). Extracted from
// the monolithic server.js to isolate the orchestration domain.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getConvoyStats, listConvoys, getDatabaseMetrics } from '../../agent/gastown-convoy.ts';

/**
 * bearerAuth is a factory `(opts?) => RequestHandler`. The consumer (server.js)
 * passes the factory so this module stays pure and does not import auth libs.
 */
export function createGastownRouter(bearerAuthFactory: (opts?: { required?: boolean }) => RequestHandler): Router {
  const router = Router();
  const authRequired = bearerAuthFactory({ required: true });

  // Live Gas Town dashboard KPIs (auth required).
  router.get('/api/gastown/dashboard', authRequired, async (_req, res) => {
    try {
      const [convoyStats, activeConvoys, dbMetrics] = await Promise.all([
        getConvoyStats(),
        listConvoys({ status: 'IN_FLIGHT' }),
        getDatabaseMetrics(),
      ]);
      res.json({
        gastown: 'v1.2.1',
        built: 'Kudbee Clone',
        activeConvoys: convoyStats.total,
        byStatus: convoyStats.byStatus,
        inFlight: activeConvoys.length,
        activeAgents: convoyStats.activeAgents,
        database: dbMetrics || {
          totalSize: 'unavailable',
          thinkTokens: { count: 0, size: '?' },
          telemetryLogs: { count: 0, size: '?' },
          governanceActions: { count: 0, size: '?' },
          topologyEmbeddings: { count: 0, size: '?' },
          auditAnchors: { count: 0, size: '?' },
          sessionCount: 0,
        },
        swarm: {
          agents: 11,
          online: 4,
          lastDeploy: process.env.SOURCE_VERSION || 'unknown',
        },
        synapse: 'C4769 active',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Full convoy list (auth required).
  router.get('/api/gastown/convoys', authRequired, (_req, res) => {
    res.json(listConvoys());
  });

  return router;
}
