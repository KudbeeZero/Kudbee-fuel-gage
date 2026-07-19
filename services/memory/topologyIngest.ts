/**
 * services/memory/topologyIngest.ts
 * ---------------------------------------------------------------------------
 * Self-Aware Architecture ingestion — chunks immutable laws, routing maps, and
 * schema definitions, embeds them, and routes them into the vector memory
 * layer (system_topology_embeddings). This is what makes the primary agent
 * self-aware of its own architecture: before writing a route/schema/infra
 * change, it queries this topology via querySystemTopology.
 *
 * Resilient-First: a failed store degrades to the in-memory mock (never throws
 * to the caller). All payloads are validated against VectorMemoryChunkSchema.
 * ---------------------------------------------------------------------------
 */

import { VectorMemoryChunkSchema, type VectorMemoryChunk } from '@kudbee/types';
import { embedText } from './embedText.ts';
import { storeSystemChunk, type TopologyMetadata } from './vectorStore.ts';

export const CHUNK_SIZE = 1500;
export const CHUNK_OVERLAP = 200;

/** Logically splits a document into overlapping windows for embedding. */
export function chunkDocument(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= CHUNK_SIZE) return [trimmed];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_SIZE, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export interface IngestSource {
  text: string;
  metadata: {
    file_path: string;
    category: TopologyMetadata['category'];
    version?: string;
    tags?: string[];
  };
}

/**
 * Validates, embeds, and stores a source document as one or more topology
 * chunks. Returns the ids of every stored chunk (or an error per chunk).
 */
export async function ingestTopology(source: IngestSource): Promise<{
  ok: boolean;
  stored: number;
  failed: number;
  ids: string[];
}> {
  const baseMetadata: TopologyMetadata = {
    file_path: source.metadata.file_path,
    category: source.metadata.category,
    version: source.metadata.version ?? '1.0.0',
    tags: source.metadata.tags ?? [] as string[]
  };

  const chunks = chunkDocument(source.text);
  const ids: string[] = [];
  let stored = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? '';
    const embedding = await embedText(chunk);
    const candidate: VectorMemoryChunk = {
      chunk_text: chunk,
      metadata: {
        category: baseMetadata.category,
        file_path: baseMetadata.file_path,
        version: baseMetadata.version,
        tags: baseMetadata.tags ?? [],
        chunk_index: String(i),
        chunk_total: String(chunks.length)
      },
      embedding
    };
    const parsed = VectorMemoryChunkSchema.safeParse(candidate);
    if (!parsed.success) {
      failed += 1;
      continue;
    }
    const result = await storeSystemChunk(
      parsed.data.chunk_text,
      parsed.data.metadata as TopologyMetadata,
      parsed.data.embedding
    );
    if (result.ok) {
      stored += 1;
      if (result.id) ids.push(result.id);
    } else {
      failed += 1;
    }
  }

  return { ok: failed === 0, stored, failed, ids };
}
