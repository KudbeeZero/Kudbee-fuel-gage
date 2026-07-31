/**
 * services/agent/gastown-convoy.ts
 * ---------------------------------------------------------------------------
 * Gastown Convoy System — Bundled Work Units with Lifecycle Tracking.
 *
 * A "Convoy" is a bundled unit of related work that spans multiple
 * agent tasks. Pattern matches the Kilo Gas Town v1.2.1 Convoy primitive:
 *   - Assembled by the Mayor (Gastown Manager)
 *   - Executed by Polecats (worker agents)
 *   - Reviewed by Refinery (ledger-keeper)
 *   - Monitored by Dogs (pipeline-guardian)
 *
 * Lifecycle: ASSEMBLED → DISPATCHED → IN_FLIGHT → REFINING → MERGED | FAILED
 * ---------------------------------------------------------------------------
 */

export const CONVOY_STATUSES = [
  'ASSEMBLED', 'DISPATCHED', 'IN_FLIGHT', 'REFINING', 'MERGED', 'FAILED', 'CANCELLED'
] as const;
export type ConvoyStatus = typeof CONVOY_STATUSES[number];

export interface ConvoyTask {
  id: string;
  agent: 'polecat' | 'refinery' | 'witness' | 'dogs';
  role: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  duration?: number;
  error?: string;
}

export interface GastownConvoy {
  id: string;
  title: string;
  description: string;
  status: ConvoyStatus;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  tasks: ConvoyTask[];
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  mergedBranch?: string;
  synthesis?: string;
  metadata: {
    source: 'mayor' | 'wasteland' | 'hook' | 'manual';
    rigId?: string;
    molecule?: string;
    tags: string[];
  };
}

let _convoys: Map<string, GastownConvoy> = new Map();

export function createConvoy(params: {
  title: string;
  description: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  tasks: Omit<ConvoyTask, 'id' | 'status' | 'result' | 'duration' | 'error'>[];
  source?: 'mayor' | 'wasteland' | 'hook' | 'manual';
  rigId?: string;
  tags?: string[];
}): GastownConvoy {
  const id = `convoy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const convoy: GastownConvoy = {
    id,
    title: params.title,
    description: params.description,
    status: 'ASSEMBLED',
    priority: params.priority || 'MEDIUM',
    tasks: params.tasks.map((t, i) => ({
      ...t,
      id: `${id}-task-${i}`,
      status: 'pending' as const,
    })),
    createdAt: new Date().toISOString(),
    metadata: {
      source: params.source || 'mayor',
      rigId: params.rigId || 'main',
      tags: params.tags || [],
    },
  };

  _convoys.set(id, convoy);
  return convoy;
}

export function dispatchConvoy(convoyId: string): GastownConvoy | null {
  const convoy = _convoys.get(convoyId);
  if (!convoy || convoy.status !== 'ASSEMBLED') return null;
  convoy.status = 'DISPATCHED';
  convoy.dispatchedAt = new Date().toISOString();
  return convoy;
}

export function startConvoy(convoyId: string): GastownConvoy | null {
  const convoy = _convoys.get(convoyId);
  if (!convoy || convoy.status !== 'DISPATCHED') return null;
  convoy.status = 'IN_FLIGHT';
  return convoy;
}

export function updateTaskStatus(convoyId: string, taskId: string, status: ConvoyTask['status'], result?: string): GastownConvoy | null {
  const convoy = _convoys.get(convoyId);
  if (!convoy) return null;
  const task = convoy.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  if (!['DISPATCHED', 'IN_FLIGHT'].includes(convoy.status)) return null;
  if (status === 'running' && convoy.status === 'DISPATCHED') convoy.status = 'IN_FLIGHT';
  if (status === 'running' && task.status !== 'pending') return null;
  if (status === 'completed' && task.status !== 'running') return null;
  if (status === 'failed' && !['pending', 'running'].includes(task.status)) return null;
  task.status = status;
  if (result !== undefined) task.result = result;
  if (status === 'completed' || status === 'failed') task.duration = Date.now() - new Date(convoy.createdAt).getTime();

  // Auto-advance convoy status
  const allDone = convoy.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
  const anyFailed = convoy.tasks.some((t) => t.status === 'failed');

  if (allDone && !anyFailed && convoy.status === 'IN_FLIGHT') {
    convoy.status = 'REFINING';
  } else if (anyFailed) {
    convoy.status = 'FAILED';
    convoy.completedAt = new Date().toISOString();
  }

  return convoy;
}

export function completeConvoy(convoyId: string, synthesis: string, mergedBranch?: string): GastownConvoy | null {
  const convoy = _convoys.get(convoyId);
  if (!convoy) return null;
  if (convoy.status !== 'REFINING') return null;
  if (convoy.tasks.some((task) => task.status !== 'completed')) return null;
  convoy.status = 'MERGED';
  convoy.completedAt = new Date().toISOString();
  convoy.synthesis = synthesis;
  convoy.mergedBranch = mergedBranch;
  return convoy;
}

export function getConvoy(convoyId: string): GastownConvoy | undefined {
  return _convoys.get(convoyId);
}

export function listConvoys(filter?: { status?: ConvoyStatus; rigId?: string }): GastownConvoy[] {
  let convoys = [..._convoys.values()];
  if (filter?.status) convoys = convoys.filter((c) => c.status === filter.status);
  if (filter?.rigId) convoys = convoys.filter((c) => c.metadata.rigId === filter.rigId);
  return convoys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getConvoyStats() {
  const all = [..._convoys.values()];
  const byStatus: Record<string, number> = {};
  for (const c of all) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }
  return {
    total: all.length,
    byStatus,
    activeAgents: new Set(all.flatMap((c) => c.tasks.map((t) => t.agent))).size,
    estimatedThroughput: all.filter((c) => c.status === 'MERGED').length,
  };
}

// ── Database health metrics ─────────────────────────────────────────────

export interface DBMetrics {
  totalSize: string;
  thinkTokens: { count: number; size: string };
  telemetryLogs: { count: number; size: string };
  governanceActions: { count: number; size: string };
  topologyEmbeddings: { count: number; size: string };
  auditAnchors: { count: number; size: string };
  sessionCount: number;
}

let _dbMetricsCache: { data: DBMetrics; ts: number } | null = null;

export async function getDatabaseMetrics(): Promise<DBMetrics | null> {
  // Cache for 60s
  if (_dbMetricsCache && Date.now() - _dbMetricsCache.ts < 60_000) {
    return _dbMetricsCache.data;
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || '',
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 5000,
    });

    const metrics: DBMetrics = {
      totalSize: '0 bytes',
      thinkTokens: { count: 0, size: '0 bytes' },
      telemetryLogs: { count: 0, size: '0 bytes' },
      governanceActions: { count: 0, size: '0 bytes' },
      topologyEmbeddings: { count: 0, size: '0 bytes' },
      auditAnchors: { count: 0, size: '0 bytes' },
      sessionCount: 0,
    };

    // Total size (always works)
    try {
      const r = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as total_size`);
      metrics.totalSize = r.rows[0]?.total_size || '0 bytes';
    } catch { /* ignore */ }

    // Think tokens
    try {
      const r = await pool.query(`SELECT count(*) as c, pg_size_pretty(pg_total_relation_size('think_tokens')) as s FROM think_tokens`);
      metrics.thinkTokens = { count: Number(r.rows[0]?.c) || 0, size: r.rows[0]?.s || '0 bytes' };
    } catch { /* table may not exist */ }

    // Telemetry logs
    try {
      const r = await pool.query(`SELECT count(*) as c, pg_size_pretty(pg_total_relation_size('telemetry_logs')) as s FROM telemetry_logs`);
      metrics.telemetryLogs = { count: Number(r.rows[0]?.c) || 0, size: r.rows[0]?.s || '0 bytes' };
    } catch { /* table may not exist */ }

    // Governance actions
    try {
      const r = await pool.query(`SELECT count(*) as c, pg_size_pretty(pg_total_relation_size('governance_actions')) as s FROM governance_actions`);
      metrics.governanceActions = { count: Number(r.rows[0]?.c) || 0, size: r.rows[0]?.s || '0 bytes' };
    } catch { /* table may not exist */ }

    // Topology embeddings
    try {
      const r = await pool.query(`SELECT count(*) as c, pg_size_pretty(pg_total_relation_size('system_topology_embeddings')) as s FROM system_topology_embeddings`);
      metrics.topologyEmbeddings = { count: Number(r.rows[0]?.c) || 0, size: r.rows[0]?.s || '0 bytes' };
    } catch { /* table may not exist */ }

    // Audit anchors
    try {
      const r = await pool.query(`SELECT count(*) as c, pg_size_pretty(pg_total_relation_size('audit_anchors')) as s FROM audit_anchors`);
      metrics.auditAnchors = { count: Number(r.rows[0]?.c) || 0, size: r.rows[0]?.s || '0 bytes' };
    } catch { /* table may not exist */ }

    await pool.end();

    _dbMetricsCache = { data: metrics, ts: Date.now() };
    return metrics;
  } catch (err) {
    console.warn('[Gastown] DB metrics query failed:', err instanceof Error ? err.message : String(err));
    return _dbMetricsCache?.data || null;
  }
}
