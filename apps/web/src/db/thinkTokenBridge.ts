import { apiPost } from '../lib/apiClient';

interface SyncThinkPayload {
  traceId: string;
  taskContext: string;
  kd: number;
  efficacy: number;
  status: 'PENDING_APPROVAL' | 'VERIFIED';
}

const thinkTokenQueue: SyncThinkPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 3_000;

function traceId(): string {
  return `lt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mintSyncThinkToken(
  taskContext: string,
  kd: number,
  efficacy: number,
): void {
  thinkTokenQueue.push({
    traceId: traceId(),
    taskContext,
    kd,
    efficacy,
    status: 'VERIFIED',
  });

  if (!flushTimer) {
    flushTimer = setTimeout(flushThinkTokens, FLUSH_INTERVAL_MS);
  }
}

async function flushThinkTokens(): Promise<void> {
  while (thinkTokenQueue.length > 0) {
    const batch = thinkTokenQueue.splice(0, 5);
    for (const payload of batch) {
      try {
        await apiPost('/api/governance/mint-think-token', {
          traceId: payload.traceId,
          taskContext: payload.taskContext,
          failedState: null,
          correctionDelta: `local_db_sync kd=${payload.kd} efficacy=${payload.efficacy}`,
          reasoningSteps: ['local-first-write', 'indexeddb-persist', 'api-sync-queued'],
          status: payload.status,
          kd: payload.kd,
          efficacy: payload.efficacy,
        });
      } catch {
        // think token mint is best-effort
      }
    }
  }

  flushTimer = null;
  if (thinkTokenQueue.length > 0) {
    flushTimer = setTimeout(flushThinkTokens, FLUSH_INTERVAL_MS);
  }
}

export function getThinkTokenQueueLength(): number {
  return thinkTokenQueue.length;
}
