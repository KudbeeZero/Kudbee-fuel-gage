-- services/ingestion/migrations/007_vector_memory.sql
-- ---------------------------------------------------------------------------
-- Generic vector memory table for semantic similarity search.
--
-- Backs the Phase 26 Vector Math Engine: stores 1536-dim embeddings for
-- arbitrary text (proven governance actions, reasoning tokens, etc.) and
-- serves them via pgvector cosine distance for sub-millisecond ANN retrieval.
--
-- Resilient-First: if the `vector` extension is unavailable the application
-- degrades to the in-process mock store in services/memory/vectorStore.ts and
-- logs a warning — it never crashes server initialization.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vector_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_memory_embedding_idx
  ON vector_memory
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
