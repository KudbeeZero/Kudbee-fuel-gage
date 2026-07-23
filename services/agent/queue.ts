/**
 * services/agent/queue.ts
 * ---------------------------------------------------------------------------
 * Task queue backed by a round-robin pool of worker_threads Workers.
 *
 * Responsibilities:
 *  - Maintain a pool of N Workers (default: os.cpus().length)
 *  - Round-robin dispatch of SubTasks to idle Workers
 *  - Capture think messages from workers → POST to /api/telemetry/thoughts
 *  - Resolve per-task promises when the worker posts a result/error
 *  - Provide waitForAll() to drain all pending tasks
 *  - Graceful shutdown()
 */

import { Worker } from 'node:worker_threads';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import type { SubTask, TaskResult, WorkerMessage } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PendingEntry {
  resolve: (value: TaskResult) => void;
  reject: (reason: unknown) => void;
}

export class TaskQueue {
  private workers: Worker[] = [];
  private pending = new Map<string, PendingEntry>();
  private roundRobinIndex = 0;
  private poolSize: number;

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? cpus().length;
    this.initializePool();
  }

  // ── Pool lifecycle ────────────────────────────────────────────────────

  private initializePool(): void {
    const workerPath = resolve(__dirname, 'worker.ts');

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath);

      worker.on('message', (msg: WorkerMessage) => {
        this.handleWorkerMessage(worker, msg);
      });

      worker.on('error', (err: Error) => {
        console.error(`[TaskQueue] Worker ${worker.threadId} error:`, err.message);
        // Reject all pending tasks assigned to this worker
        for (const [taskId, entry] of this.pending) {
          entry.reject(new Error(`Worker ${worker.threadId} crashed: ${err.message}`));
          this.pending.delete(taskId);
        }
      });

      worker.on('exit', (code: number) => {
        if (code !== 0) {
          console.warn(`[TaskQueue] Worker ${worker.threadId} exited with code ${code}`);
        }
      });

      this.workers.push(worker);
    }
  }

  // ── Message handler ───────────────────────────────────────────────────

  private handleWorkerMessage(worker: Worker, msg: WorkerMessage): void {
    switch (msg.type) {
      case 'think': {
        // Forward think blocks to telemetry endpoint
        this.forwardThinkToTelemetry(msg).catch((err) => {
          console.error('[TaskQueue] Failed to forward think to telemetry:', err);
        });
        break;
      }

      case 'result': {
        const entry = this.pending.get(msg.taskId);
        if (entry) {
          const payload = msg.payload as TaskResult;
          entry.resolve(payload);
          this.pending.delete(msg.taskId);
        }
        break;
      }

      case 'error': {
        const entry = this.pending.get(msg.taskId);
        if (entry) {
          const payload = msg.payload as { message: string; success: boolean; duration: number };
          entry.reject(new Error(`[${msg.role}] ${payload.message}`));
          this.pending.delete(msg.taskId);
        }
        break;
      }

      case 'progress':
      case 'task':
      default:
        // Progress updates are informational; no action needed
        break;
    }
  }

  // ── Telemetry forwarding ──────────────────────────────────────────────

  private async forwardThinkToTelemetry(msg: WorkerMessage): Promise<void> {
    const payload = msg.payload as {
      thinkingText?: string;
      model?: string;
      visibleText?: string;
    };

    const body = {
      model: payload.model ?? 'unknown',
      thinkingText: payload.thinkingText ?? '',
      visibleText: payload.visibleText ?? '',
      session: {
        evalCount: 0,
        tokensPerSecond: 0,
      },
      timestamp: msg.timestamp,
    };

    await fetch('http://localhost:3000/api/telemetry/thoughts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Enqueue a SubTask for execution. Returns a Promise that resolves when
   * the assigned Worker posts a result, or rejects on error.
   */
  enqueue(task: SubTask): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      this.pending.set(task.id, { resolve, reject });

      // Round-robin dispatch
      const worker = this.workers[this.roundRobinIndex % this.poolSize];
      this.roundRobinIndex = (this.roundRobinIndex + 1) % this.poolSize;

      worker.postMessage(task);
    });
  }

  /**
   * Wait for all currently pending tasks to complete.
   * Returns an array of all TaskResults.
   */
  async waitForAll(): Promise<TaskResult[]> {
    const pendingIds = Array.from(this.pending.keys());
    if (pendingIds.length === 0) return [];

    const results = await Promise.allSettled(
      pendingIds.map((id) => {
        const entry = this.pending.get(id);
        if (!entry) {
          return Promise.reject(new Error(`No pending entry for task ${id}`));
        }
        return new Promise<TaskResult>((resolve, reject) => {
          // Wrap the existing resolve/reject to track settlement
          const originalResolve = entry.resolve;
          const originalReject = entry.reject;
          entry.resolve = (val: TaskResult) => {
            originalResolve(val);
            resolve(val);
          };
          entry.reject = (err: unknown) => {
            originalReject(err);
            reject(err);
          };
        });
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<TaskResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Terminate all workers gracefully.
   */
  shutdown(): void {
    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch {
        // Worker may already be terminated
      }
    }
    this.workers = [];
    this.pending.clear();
  }
}
