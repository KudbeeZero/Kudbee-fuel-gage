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
import type { ThinkToken } from '@kudbee/types';

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
      const res = await pool.query(
        `SELECT id, text AS chunk_text, metadata, embedding,
                1 - (embedding <=> $1::vector) AS similarity
         FROM vector_memory
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [toVectorLiteral(embedding), limit]
      );
      const results: SystemChunk[] = res.rows
        .filter((row: TopologyRow) => (Number(row.similarity) || 0) >= minScore)
        .map((row: TopologyRow) => ({
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
      const res = await pool.query(
        `INSERT INTO vector_memory (id, text, embedding, metadata)
         VALUES ($1, $2, $3::vector, $4)
         RETURNING id`,
        [randomUUID(), text, toVectorLiteral(embedding), JSON.stringify(metadata)]
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

/** Convenience: embed text and store it in vector memory in one call. */
export async function storeMemoryText(text: string, metadata: TopologyMetadata): Promise<StoreChunkResult> {
  const { embedText } = await import('./embedText.ts');
  const embedding = await embedText(text);
  return storeMemory(text, metadata, embedding);
}

export { EMBEDDING_DIM };
