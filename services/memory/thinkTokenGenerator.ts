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
import { publishEvent as publishUnifiedEvent } from '../lib/unifiedEvents.ts';
import { EMBEDDING_DIM, embedText } from './embedText.ts';
import type { ThinkToken } from '@kudbee/types';

const VECTOR_INSERT_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err instanceof Error ? err : new Error(String(err))); }
    );
  });
}

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
  struggleLog?: string[];
  remediationPath?: string[];
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
    status: requestedStatus,
    kd = 0,
    efficacy = 0,
    locked_by = null
  } = payload;

  // Phase 5M — lifecycle authority invariant: the mint primitive may ONLY
  // create PENDING_APPROVAL. Caller-supplied VERIFIED/RECYCLED/PROVEN (or any
  // other privileged or non-standard state) is neutralized here, so no internal
  // caller can bypass the HTTP capability boundary. Approval is a separate
  // authority owned by transitionThinkTokenStatus().
  const status = 'PENDING_APPROVAL';
  if (requestedStatus && requestedStatus !== 'PENDING_APPROVAL') {
    console.warn(
      `[ThinkToken] mintThinkToken() forced caller-requested status '${requestedStatus}' → PENDING_APPROVAL (Phase 5M lifecycle invariant).`
    );
  }

  if (!correctionDelta) {
    return { ok: false, error: 'correctionDelta is required' };
  }

  try {
    const trajectoryText = buildTrajectoryText(payload);
    // Gemini-first: real 1536-dim embedding via GEMINI_API_KEY, graceful local fallback.
    const embedding = await embedText(trajectoryText);

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
        const res = await withTimeout(
          pool.query(
            `INSERT INTO think_tokens (original_trace_id, task_context, failed_state, correction_delta, embedding, status, token_cost, kd, efficacy, locked_by)
             VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10)
             RETURNING id`,
            [originalTraceId, taskContextJson, failedStateJson, correctionDelta, embeddingJson, status, cost, kd, efficacy, locked_by]
          ),
          VECTOR_INSERT_TIMEOUT_MS,
          'think_token insert'
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
      void publishUnifiedEvent('system', 'think_token_minted', {
        id: tokenId, agentId, originalTraceId, status, cost, latencyMs,
        embedding_dim: embedding.length, kd, efficacy, locked_by,
        timestamp: new Date().toISOString()
      }, REDIS_THINK_TOKENS_CHANNEL);
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

export interface TransitionThinkTokenPayload {
  tokenId: string;
  status: 'VERIFIED' | 'RECYCLED';
  reviewerNotes?: string | null;
  actor?: string | null;
}

export type TransitionThinkTokenResult =
  | { ok: true; tokenId: string; status: 'VERIFIED' | 'RECYCLED' }
  | { ok: false; error: string };

/**
 * Phase 5M — authoritative lifecycle transition.
 *
 * The ONLY way a THINK token may reach VERIFIED or RECYCLED. This is a
 * separate authority from minting: `mintThinkToken()` always creates
 * PENDING_APPROVAL; this function performs the authorized promotion/recycle
 * transition. It enforces the state invariant at the lowest level so no
 * internal caller or future endpoint can manufacture a privileged state.
 *
 * This is a state-transition primitive only — it does not perform its own
 * authentication. Authorization must live above it (HTTP auth → capability /
 * RBAC → authorized route → this transition → database).
 */
export async function transitionThinkTokenStatus(
  payload: TransitionThinkTokenPayload
): Promise<TransitionThinkTokenResult> {
  const { tokenId, status } = payload;
  if (status !== 'VERIFIED' && status !== 'RECYCLED') {
    return {
      ok: false,
      error: `Invalid transition status: ${status}. Allowed: VERIFIED, RECYCLED`,
    };
  }
  if (!tokenId) {
    return { ok: false, error: 'tokenId is required' };
  }
  try {
    const pool = getDbPool();
    if (pool && isDbHealthy()) {
      await withTimeout(
        pool.query('UPDATE think_tokens SET status = $1 WHERE id = $2', [status, String(tokenId)]),
        VECTOR_INSERT_TIMEOUT_MS,
        'think_token status transition'
      );
    } else {
      await runInsert('UPDATE think_tokens SET status = $1 WHERE id = $2', [status, String(tokenId)]);
    }
    return { ok: true, tokenId: String(tokenId), status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[ThinkToken] Status transition failed:', message);
    return { ok: false, error: message };
  }
}
