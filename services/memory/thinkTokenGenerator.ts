/**
 * services/memory/thinkTokenGenerator.ts
 * ---------------------------------------------------------------------------
 * Phase 28 Think Token Generator Service
 *
 * Auto-synthesizes successful reasoning steps into verified "Think Tokens"
 * with 1536-dim trajectory embeddings, stores them in Neon Postgres, and
 * pushes telemetry to Redis pub/sub. Resilient-First: never crashes on
 * network drops or missing secrets — degrades gracefully.
 * ---------------------------------------------------------------------------
 */

import { getDbPool, isDbHealthy, runInsert } from '../lib/db.js';
import { getRedisClient } from '../lib/redis.js';
import { EMBEDDING_DIM, embedTextLocal } from './embedText.ts';
import type { ThinkToken } from '@kudbee/types';

export interface MintThinkTokenPayload {
  agentId?: string;
  traceId?: string;
  taskContext?: Record<string, unknown>;
  failedState?: Record<string, unknown>;
  correctionDelta?: string;
  reasoningSteps?: string[];
  cost?: number;
  latencyMs?: number;
  status?: ThinkToken['status'];
  kd?: number;
  efficacy?: number;
  locked_by?: string | null;
}

export type MintThinkTokenResult =
  | { ok: true; id: string; embedding: number[] }
  | { ok: false; error: string };

const REDIS_THINK_TOKENS_CHANNEL = 'kudbee:think:tokens';

function buildTrajectoryText(payload: MintThinkTokenPayload): string {
  const parts: string[] = [];
  if (payload.traceId) parts.push(`traceId:${payload.traceId}`);
  if (payload.agentId) parts.push(`agent:${payload.agentId}`);
  if (payload.reasoningSteps && payload.reasoningSteps.length > 0) {
    parts.push(...payload.reasoningSteps);
  }
  if (payload.cost !== undefined) parts.push(`cost:${payload.cost}`);
  if (payload.latencyMs !== undefined) parts.push(`latencyMs:${payload.latencyMs}`);
  if (payload.correctionDelta) parts.push(`delta:${payload.correctionDelta}`);
  return parts.filter(Boolean).join(' | ');
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Mint a Think Token: computes a 1536-dim trajectory embedding, upserts the
 * token into Neon Postgres `think_tokens`, and publishes telemetry to Redis.
 *
 * Returns the token ID and embedding on success. Never throws — degrades to
 * the in-memory store when Neon is unavailable.
 */
export async function mintThinkToken(
  payload: MintThinkTokenPayload
): Promise<MintThinkTokenResult> {
  const {
    agentId = `agent-${process.pid}`,
    traceId,
    taskContext = {},
    failedState = {},
    correctionDelta = '',
    reasoningSteps = [],
    cost = 0,
    latencyMs = 0,
    status = 'PENDING_APPROVAL',
    kd = 0,
    efficacy = 0,
    locked_by = null
  } = payload;

  if (!correctionDelta) {
    return { ok: false, error: 'correctionDelta is required' };
  }

  try {
    const trajectoryText = buildTrajectoryText(payload);
    const embedding = embedTextLocal(trajectoryText);

    if (embedding.length !== EMBEDDING_DIM) {
      return {
        ok: false,
        error: `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
      };
    }

    const originalTraceId = traceId || `trace-${Date.now()}-${process.pid}`;
    const taskContextJson = JSON.stringify(taskContext);
    const failedStateJson = JSON.stringify(failedState);
    const embeddingJson = JSON.stringify(embedding);

    let tokenId: string;

    const pool = getDbPool();
    if (pool && isDbHealthy()) {
      try {
        const res = await pool.query(
          `INSERT INTO think_tokens (original_trace_id, task_context, failed_state, correction_delta, embedding, status, token_cost, kd, efficacy, locked_by)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10)
           RETURNING id`,
          [originalTraceId, taskContextJson, failedStateJson, correctionDelta, embeddingJson, status, cost, kd, efficacy, locked_by]
        );
        tokenId = String(res.rows[0]?.id ?? originalTraceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[ThinkToken] DB insert failed, degrading to runInsert:', message);
        const result = await runInsert(
          `INSERT INTO think_tokens (original_trace_id, task_context, failed_state, correction_delta, embedding, status, token_cost, kd, efficacy, locked_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [originalTraceId, taskContextJson, failedStateJson, correctionDelta, embeddingJson, status, cost, kd, efficacy, locked_by]
        );
        tokenId = String(result.id ?? originalTraceId);
      }
    } else {
      const result = await runInsert(
        `INSERT INTO think_tokens (original_trace_id, task_context, failed_state, correction_delta, embedding, status, token_cost, kd, efficacy, locked_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [originalTraceId, taskContextJson, failedStateJson, correctionDelta, embeddingJson, status, cost, kd, efficacy, locked_by]
      );
      tokenId = String(result.id ?? originalTraceId);
    }

    try {
      const redis = getRedisClient({ label: 'think-token' });
      await redis.publish(
        REDIS_THINK_TOKENS_CHANNEL,
        JSON.stringify({
          type: 'think_token_minted',
          data: {
            id: tokenId,
            agentId,
            originalTraceId,
            status,
            cost,
            latencyMs,
            embedding_dim: embedding.length,
            kd,
            efficacy,
            locked_by,
            timestamp: new Date().toISOString()
          }
        })
      );
    } catch {
      // best-effort telemetry; never block minting on Redis
    }

    return { ok: true, id: tokenId, embedding };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[ThinkToken] Mint failed (degraded):', message);
    return { ok: false, error: message };
  }
}
