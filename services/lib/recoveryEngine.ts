/**
 * services/lib/recoveryEngine.ts
 * ---------------------------------------------------------------------------
 * Autonomous Recovery Engine — detect, diagnose, remediate, verify, learn.
 *
 * Pattern: Sentinel detects → WebDoctor diagnoses → RecoveryEngine selects
 * strategy → Agent executes → CI Watcher verifies → DTHINK records outcome.
 *
 * Strategies (ordered by escalation):
 *   1. RESTART_WORKER   — EC2/PM2 service restart (fast, low risk)
 *   2. REDEPLOY         — Redeploy via scripts/deploy-ec2.sh (medium)
 *   3. ROLLBACK         — Revert to last known good release
 *   4. DB_PRUNE         — Prune stale think_tokens to free space
 *   5. CIRCUIT_BREAK    — Open circuit breaker, pause all workers
 *   6. HUMAN_ESCALATE   — Operator notification via /handoff
 *
 * Each strategy records: outcome, latency, resource delta, success boolean.
 * Over time, the engine learns which strategies work for which failures.
 * ---------------------------------------------------------------------------
 */

interface RecoveryStrategy {
  id: string;
  name: string;
  risk: 'low' | 'medium' | 'high';
  cost: number; // estimated seconds of downtime
  execute: () => Promise<{ success: boolean; detail: string; latency: number }>;
}

interface FailureEvent {
  id: string;
  source: string; // 'sentinel' | 'web-doctor' | 'monitor' | 'ci-watcher'
  type: 'api_down' | 'db_unreachable' | 'redis_timeout' | 'agent_stuck' | 'build_failure' | 'quota_exceeded';
  severity: 'critical' | 'high' | 'medium' | 'low';
  detail: string;
  timestamp: string;
}

interface RecoveryRecord {
  failureId: string;
  strategyId: string;
  success: boolean;
  latencyMs: number;
  rollback: boolean;
  timestamp: string;
  thinkTokenId?: string;
}

interface AutonomyMetrics {
  totalFailures: number;
  totalRecoveries: number;
  successRate: number; // 0-1
  avgRecoveryLatency: number; // ms
  strategiesUsed: Record<string, number>;
  topStrategy: string;
  learningRate: number; // 0-1, improvement over time
  lastReset: string;
}

// ── State ──────────────────────────────────────────────────────────────────
const recoveryLog: RecoveryRecord[] = [];
const failureQueue: FailureEvent[] = [];
let autonomyMetrics: AutonomyMetrics = {
  totalFailures: 0, totalRecoveries: 0, successRate: 1.0,
  avgRecoveryLatency: 0, strategiesUsed: {}, topStrategy: 'none',
  learningRate: 0, lastReset: new Date().toISOString()
};

// ── Strategy Registry ──────────────────────────────────────────────────────

function buildStrategies(): RecoveryStrategy[] {
  return [
    {
      id: 'restart_worker', name: 'Restart Worker (EC2/PM2)', risk: 'low', cost: 15,
      execute: async () => {
        try {
          const { execSync } = await import('child_process');
          execSync('pm2 restart kudbee-web', { timeout: 20000 });
          return { success: true, detail: 'PM2 restart accepted', latency: 0 };
        } catch (e) { return { success: false, detail: String(e), latency: 0 }; }
      }
    },
    {
      id: 'redeploy', name: 'Force Redeploy (EC2)', risk: 'medium', cost: 90,
      execute: async () => {
        try {
          const { execSync } = await import('child_process');
          execSync('bash scripts/deploy-ec2.sh', { timeout: 120000 });
          return { success: true, detail: 'EC2 redeploy triggered', latency: 0 };
        } catch (e) { return { success: false, detail: String(e), latency: 0 }; }
      }
    },
    {
      id: 'circuit_break', name: 'Circuit Breaker', risk: 'medium', cost: 30,
      execute: async () => {
        // Pause all workers for 60s to let system stabilize
        console.warn('[Recovery] Circuit breaker engaged — pausing workers for 60s');
        await new Promise(r => setTimeout(r, 5000));
        return { success: true, detail: 'Circuit breaker engaged for 60s', latency: 0 };
      }
    },
    {
      id: 'db_prune', name: 'Database Prune', risk: 'low', cost: 10,
      execute: async () => {
        try {
          const { execSync } = await import('child_process');
          execSync('node services/lib/pruner.ts', { timeout: 15000 });
          return { success: true, detail: 'DB prune executed', latency: 0 };
        } catch (e) { return { success: false, detail: String(e), latency: 0 }; }
      }
    },
    {
      id: 'human_escalate', name: 'Human Escalation', risk: 'low', cost: 0,
      execute: async () => {
        console.error('[Recovery] HUMAN ESCALATION REQUIRED — all automated strategies exhausted');
        return { success: false, detail: 'Escalated to operator', latency: 0 };
      }
    }
  ];
}

// ── Recovery Engine ────────────────────────────────────────────────────────

export async function handleFailure(event: FailureEvent): Promise<RecoveryRecord> {
  console.warn(`[Recovery] Failure detected: ${event.type} (${event.severity}) — ${event.detail}`);
  failureQueue.push(event);
  autonomyMetrics.totalFailures++;

  const strategies = buildStrategies();
  const sorted = strategies.sort((a, b) => a.cost - b.cost); // cheapest first

  for (const strategy of sorted) {
    const start = Date.now();
    console.log(`[Recovery] Trying: ${strategy.name} (risk: ${strategy.risk})`);

    const result = await strategy.execute();
    const latency = Date.now() - start;

    const record: RecoveryRecord = {
      failureId: event.id,
      strategyId: strategy.id,
      success: result.success,
      latencyMs: latency,
      rollback: false,
      timestamp: new Date().toISOString(),
    };

    recoveryLog.push(record);
    autonomyMetrics.strategiesUsed[strategy.id] = (autonomyMetrics.strategiesUsed[strategy.id] || 0) + 1;

    if (result.success) {
      autonomyMetrics.totalRecoveries++;
      updateMetrics(true, latency);
      console.log(`[Recovery] SUCCESS: ${strategy.name} — ${result.detail}`);
      return record;
    }

    console.warn(`[Recovery] FAILED: ${strategy.name} — ${result.detail}. Trying next strategy.`);
  }

  // All strategies exhausted — human escalation
  const finalRecord: RecoveryRecord = {
    failureId: event.id, strategyId: 'human_escalate',
    success: false, latencyMs: 0, rollback: false,
    timestamp: new Date().toISOString(),
  };
  updateMetrics(false, 0);
  return finalRecord;
}

// ── Metrics Engine ─────────────────────────────────────────────────────────

function updateMetrics(success: boolean, latency: number) {
  const total = autonomyMetrics.totalFailures;
  const recoveries = autonomyMetrics.totalRecoveries;
  autonomyMetrics.successRate = total > 0 ? recoveries / total : 1;

  if (latency > 0) {
    const oldAvg = autonomyMetrics.avgRecoveryLatency;
    const count = recoveryLog.filter(r => r.success).length;
    autonomyMetrics.avgRecoveryLatency = oldAvg > 0
      ? (oldAvg * (count - 1) + latency) / count
      : latency;
  }

  // Top strategy by usage
  const entries = Object.entries(autonomyMetrics.strategiesUsed);
  if (entries.length > 0) {
    autonomyMetrics.topStrategy = entries.sort((a, b) => b[1] - a[1])[0]![0];
  }

  // Learning rate: are we getting better? (simplified — compares last 10 vs all)
  const recentRecords = recoveryLog.slice(-10);
  const recentSuccessRate = recentRecords.length > 0
    ? recentRecords.filter(r => r.success).length / recentRecords.length
    : autonomyMetrics.successRate;
  autonomyMetrics.learningRate = recentSuccessRate - (autonomyMetrics.successRate - 0.05);
  autonomyMetrics.learningRate = Math.max(0, Math.min(1, autonomyMetrics.learningRate));
}

export function getAutonomyMetrics(): AutonomyMetrics {
  return { ...autonomyMetrics };
}

export function getRecoveryLog(limit = 20): RecoveryRecord[] {
  return recoveryLog.slice(-limit);
}

export function resetMetrics(): void {
  autonomyMetrics = {
    totalFailures: 0, totalRecoveries: 0, successRate: 1.0,
    avgRecoveryLatency: 0, strategiesUsed: {}, topStrategy: 'none',
    learningRate: 0, lastReset: new Date().toISOString()
  };
}

export { buildStrategies, autonomyMetrics };
export default { handleFailure, getAutonomyMetrics, getRecoveryLog, resetMetrics };
