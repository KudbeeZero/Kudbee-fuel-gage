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

export interface TopologyMetadata {
  file_path: string;
  category: 'layout' | 'router' | 'schema' | 'config' | 'doc';
  version: string;
  [key: string]: string;
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
}

// In-memory mock store (Resilient-First degrade path).
const memoryStore: MemoryEntry[] = [];

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
      const res = await pool.query(
        `INSERT INTO system_topology_embeddings (id, chunk_text, metadata, embedding)
         VALUES ($1, $2, $3, $4::vector)
         RETURNING id`,
        [randomUUID(), text, JSON.stringify(metadata), toVectorLiteral(embedding)]
      );
      return { ok: true, id: String(res.rows[0]?.id ?? randomUUID()) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Vector] DB store failed, degrading to memory mock:', message);
    }
  }

  const id = randomUUID();
  memoryStore.push({ id, chunk_text: text, metadata, embedding });
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
      const res = await pool.query(
        `SELECT id, chunk_text, metadata, embedding
         FROM system_topology_embeddings
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [toVectorLiteral(embedding), limit]
      );
      const results: SystemChunk[] = res.rows.map((row: TopologyRow) => ({
        id: String(row.id),
        chunk_text: String(row.chunk_text),
        metadata: row.metadata,
        embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : []
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

export { EMBEDDING_DIM };
