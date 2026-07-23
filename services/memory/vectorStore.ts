/**
 * services/memory/vectorStore.ts
 * ---------------------------------------------------------------------------
 * Self-Aware Vector Memory Layer (Think: Storage)
 *
 * Stores structured chunks of the system blueprint (code, architecture
 * markdown, router rules) as pgvector embeddings and retrieves them by cosine
 * similarity. Resilient-First: when Neon/pgvector is unavailable the layer
 * degrades to an in-process mock store with JS-computed cosine similarity, so
 * the agent can still query topology locally without crashing.
 * ---------------------------------------------------------------------------
 */

import { randomUUID } from 'node:crypto';
import { getDbPool, isDbHealthy } from '../lib/db.js';
import { EMBEDDING_DIM, embedTextLocal } from './embedText.ts';

const VECTOR_OP_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err instanceof Error ? err : new Error(String(err))); }
    );
  });
}

export interface TopologyMetadata {
  file_path: string;
  category: 'layout' | 'router' | 'schema' | 'config' | 'doc' | 'law' | 'prompt';
  version: string;
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

export interface SystemChunk {
  id: string;
  chunk_text: string;
  metadata: TopologyMetadata;
  embedding: number[];
}

export type StoreChunkResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type QueryResult =
  | { ok: true; results: SystemChunk[] }
  | { ok: false; error: string };

interface MemoryEntry {
  id: string;
  chunk_text: string;
  metadata: TopologyMetadata;
  embedding: number[];
}

interface TopologyRow {
  id: unknown;
  chunk_text: unknown;
  metadata: TopologyMetadata;
  embedding: unknown;
  similarity?: number;
}

// In-memory mock store (Resilient-First degrade path).
// Capped at 10K entries with FIFO eviction to prevent OOM during extended DB outages.
const MAX_MEMORY_STORE = 10_000;
const memoryStore: MemoryEntry[] = [];

function cappedPush(entry: MemoryEntry): void {
  if (memoryStore.length >= MAX_MEMORY_STORE) memoryStore.shift();
  cappedPush(entry);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function parseVectorString(value: unknown): number[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  return [];
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Persists a system-topology chunk with its embedding. Degrades to the
 * in-memory mock when the database is unhealthy (never throws).
 */
export async function storeSystemChunk(
  text: string,
  metadata: TopologyMetadata,
  embedding: number[]
): Promise<StoreChunkResult> {
  if (embedding.length !== EMBEDDING_DIM) {
    return {
      ok: false,
      error: `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
    };
  }

  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    try {
      const res = await withTimeout(
        pool.query(
          `INSERT INTO system_topology_embeddings (id, chunk_text, metadata, embedding)
           VALUES ($1, $2, $3, $4::vector)
           RETURNING id`,
          [randomUUID(), text, JSON.stringify(metadata), toVectorLiteral(embedding)]
        ),
        VECTOR_OP_TIMEOUT_MS,
        'topology_embeddings insert'
      );
      return { ok: true, id: String(res.rows[0]?.id ?? randomUUID()) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Vector] DB store failed, degrading to memory mock:', message);
    }
  }

  const id = randomUUID();
  cappedPush({ id, chunk_text: text, metadata, embedding });
  return { ok: true, id };
}

/**
 * Semantic search over the system topology using pgvector cosine distance
 * (`embedding <=> $1`). Falls back to JS cosine similarity on the mock store.
 */
export async function querySystemTopology(
  embedding: number[],
  limit = 5
): Promise<QueryResult> {
  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    try {
      const res = await withTimeout(
        pool.query(
          `SELECT id, chunk_text, metadata, embedding
           FROM system_topology_embeddings
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [toVectorLiteral(embedding), limit]
        ),
        VECTOR_OP_TIMEOUT_MS,
        'topology_embeddings search'
      );
      const results: SystemChunk[] = (res.rows as unknown as TopologyRow[]).map((row) => ({
        id: String(row.id),
        chunk_text: String(row.chunk_text),
        metadata: row.metadata,
        embedding: parseVectorString(row.embedding)
      }));
      return { ok: true, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Vector] DB query failed, degrading to memory mock:', message);
    }
  }

  const ranked = memoryStore
    .map((entry) => ({ entry, score: cosineSimilarity(embedding, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({
      id: entry.id,
      chunk_text: entry.chunk_text,
      metadata: entry.metadata,
      embedding: entry.embedding
    }));
  return { ok: true, results: ranked };
}

/** Convenience: embed text and store it in one call. */
export async function storeSystemChunkText(
  text: string,
  metadata: TopologyMetadata
): Promise<StoreChunkResult> {
  const embedding = embedTextLocal(text);
  return storeSystemChunk(text, metadata, embedding);
}

/**
 * Semantic similarity search over the vector memory store.
 *
 * Accepts either raw text or a precomputed embedding. When text is supplied it
 * is embedded first via `embedText`, then queried against the `vector_memory`
 * table using pgvector cosine distance (`<=>`). Only rows whose cosine
 * similarity meets `minScore` are returned.
 *
 * Resilient-First: if Neon/pgvector is unavailable the search degrades to the
 * in-process mock store using JS cosine similarity.
 */
export async function searchSimilar(
  textOrEmbedding: string | number[],
  limit = 5,
  minScore = 0.3
): Promise<QueryResult> {
  let embedding: number[];
  if (typeof textOrEmbedding === 'string') {
    const { embedText } = await import('./embedText.ts');
    embedding = await embedText(textOrEmbedding);
  } else {
    embedding = textOrEmbedding;
  }

  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    try {
      const res = await withTimeout(
        pool.query(
          `SELECT id, text AS chunk_text, metadata, embedding,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM vector_memory
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [toVectorLiteral(embedding), limit]
        ),
        VECTOR_OP_TIMEOUT_MS,
        'vector_memory search'
      );
      const rows = res.rows as unknown as TopologyRow[];
      const results: SystemChunk[] = rows
        .filter((row) => (Number(row.similarity) || 0) >= minScore)
        .map((row) => ({
          id: String(row.id),
          chunk_text: String(row.chunk_text),
          metadata: row.metadata,
          embedding: parseVectorString(row.embedding)
        }));
      return { ok: true, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Vector] DB search failed, degrading to memory mock:', message);
    }
  }

  const ranked = memoryStore
    .map((entry) => ({ entry, score: cosineSimilarity(embedding, entry.embedding) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({
      id: entry.id,
      chunk_text: entry.chunk_text,
      metadata: entry.metadata,
      embedding: entry.embedding
    }));
  return { ok: true, results: ranked };
}

// --- Phase 28: The Token Forge — Dynamic Few-Shot RAG ------------------------
// Retrieves the most semantically similar past "Think Tokens" (successful
// correction deltas) for an incoming prompt, so they can be injected into the
// active agent's system prompt as "Past Successful Execution Context" BEFORE
// it routes to the LLM. This is the few-shot RAG loop that grounds the agent in
// verified prior successes instead of reasoning from a cold start.

export interface RelevantThinkToken {
  id: string;
  correction_delta: string;
  task_context: Record<string, unknown> | null;
  failed_state: Record<string, unknown> | null;
  similarity: number;
  status: string;
  created_at: string | null;
  kd: number;
  efficacy: number;
  locked_by: string | null;
}

export type RelevantThinkTokenResult =
  | { ok: true; results: RelevantThinkToken[] }
  | { ok: false; error: string };

interface ThinkTokenRow {
  id: unknown;
  correction_delta: unknown;
  task_context: unknown;
  failed_state: unknown;
  embedding: unknown;
  status: unknown;
  created_at: unknown;
  similarity?: unknown;
  kd?: unknown;
  efficacy?: unknown;
  locked_by?: unknown;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Query the `think_tokens` pgvector store for the `limit` most semantically
 * similar past successes to `prompt`. Only VERIFIED tokens (proven successes)
 * are returned when available; if none are verified, the best-effort top-k is
 * returned so the forge never starves the agent of context.
 *
 * Resilient-First: when Neon/pgvector is unavailable, or the query fails, this
 * returns `{ ok: true, results: [] }` so the caller (context factory) can
 * inject an empty "no past successes" note and keep routing. It NEVER throws.
 */
export async function getRelevantThinkTokens(
  prompt: string,
  limit = 3
): Promise<RelevantThinkTokenResult> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 3, 1), 25);
  const text = typeof prompt === 'string' && prompt.length > 0 ? prompt : '';

  let embedding: number[];
  try {
    const { embedText } = await import('./embedText.ts');
    embedding = await embedText(text);
  } catch {
    embedding = embedTextLocal(text);
  }
  if (embedding.length !== EMBEDDING_DIM) {
    return { ok: false, error: `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}` };
  }

  const pool = getDbPool();

  if (pool && isDbHealthy()) {
    try {
      const verifiedRows = await withTimeout(
        pool.query(
          `SELECT id, correction_delta, task_context, failed_state, embedding, status, created_at,
                  COALESCE(kd, 0) AS kd, COALESCE(efficacy, 0) AS efficacy, locked_by,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM think_tokens
           WHERE status = 'VERIFIED'
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [toVectorLiteral(embedding), safeLimit]
        ),
        VECTOR_OP_TIMEOUT_MS,
        'pgvector think_tokens similarity search'
      );

      const rows: ThinkTokenRow[] =
        ((verifiedRows as { rows: Record<string, unknown>[] }).rows?.length ?? 0) > 0
          ? (verifiedRows as { rows: Record<string, unknown>[] }).rows as unknown as ThinkTokenRow[]
          : (await withTimeout(
              pool.query(
                `SELECT id, correction_delta, task_context, failed_state, embedding, status, created_at,
                        COALESCE(kd, 0) AS kd, COALESCE(efficacy, 0) AS efficacy, locked_by,
                        1 - (embedding <=> $1::vector) AS similarity
                 FROM think_tokens
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`,
                [toVectorLiteral(embedding), safeLimit]
              ),
              VECTOR_OP_TIMEOUT_MS,
              'pgvector think_tokens fallback search'
            )).rows as unknown as ThinkTokenRow[];

      const results: RelevantThinkToken[] = rows.map((row) => ({
        id: String(row.id),
        correction_delta: String(row.correction_delta ?? ''),
        task_context: parseRecord(row.task_context),
        failed_state: parseRecord(row.failed_state),
        similarity: Number(row.similarity ?? 0),
        status: String(row.status ?? 'PENDING_APPROVAL'),
        created_at: row.created_at ? String(row.created_at) : null,
        kd: Number(row.kd ?? 0),
        efficacy: Number(row.efficacy ?? 0),
        locked_by: row.locked_by ? String(row.locked_by) : null
      }));
      return { ok: true, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[TokenForge] think_tokens query failed, degrading to empty:', message);
    }
  }

  // No DB / query failed — return an empty success so the context factory can
  // inject a graceful "no past successes retrieved" note. Never throws.
  return { ok: true, results: [] };
}

/**
 * Render the retrieved Think Tokens as a "Past Successful Execution Context"
 * prompt fragment, ready to inject into the active agent's system prompt.
 * Returns an empty string when no tokens were retrieved so callers can skip
 * the section cleanly.
 */
export function renderThinkTokenContext(tokens: RelevantThinkToken[]): string {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  const blocks = tokens.map((t, i) => {
    const sim = Number.isFinite(t.similarity) ? t.similarity.toFixed(3) : '0.000';
    const delta = t.correction_delta || '(no correction delta recorded)';
    return `### Past Success #${i + 1} (similarity ${sim}, status ${t.status})
${delta}`;
  });
  return `<PAST_SUCCESSFUL_EXECUTION_CONTEXT>
The following are semantically similar past SUCCESSFUL agent executions,
retrieved from the Think Token Forge (pgvector). Treat them as proven
few-shot exemplars — ground your reasoning in their correction deltas and
avoid repeating any failed approach they supersede. Do NOT copy them
verbatim; use them only as structural guidance.

${blocks.join('\n\n')}
</PAST_SUCCESSFUL_EXECUTION_CONTEXT>`;
}

/**
 * Persists an arbitrary text+embedding pair into the `vector_memory` table.
 * Used by the Governance Router to index approved proven actions for Fast Brain
 * semantic recall. Degrades to the in-memory mock when Neon is unavailable.
 */
export async function storeMemory(
  text: string,
  metadata: TopologyMetadata,
  embedding: number[]
): Promise<StoreChunkResult> {
  if (embedding.length !== EMBEDDING_DIM) {
    return {
      ok: false,
      error: `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
    };
  }

  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    try {
      const res = await withTimeout(
        pool.query(
          `INSERT INTO vector_memory (id, text, embedding, metadata)
           VALUES ($1, $2, $3::vector, $4)
           RETURNING id`,
          [randomUUID(), text, toVectorLiteral(embedding), JSON.stringify(metadata)]
        ),
        VECTOR_OP_TIMEOUT_MS,
        'vector_memory insert'
      );
      return { ok: true, id: String(res.rows[0]?.id ?? randomUUID()) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Vector] DB store failed, degrading to memory mock:', message);
    }
  }

  const id = randomUUID();
  cappedPush({ id, chunk_text: text, metadata, embedding });
  return { ok: true, id };
}

/** Convenience: embed text and store it in vector memory in one call. */
export async function storeMemoryText(text: string, metadata: TopologyMetadata): Promise<StoreChunkResult> {
  const { embedText } = await import('./embedText.ts');
  const embedding = await embedText(text);
  return storeMemory(text, metadata, embedding);
}

export { EMBEDDING_DIM };
