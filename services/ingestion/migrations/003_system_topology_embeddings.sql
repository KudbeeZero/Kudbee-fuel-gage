-- services/ingestion/migrations/003_system_topology_embeddings.sql
-- ---------------------------------------------------------------------------
-- Self-Aware Vector Memory Layer (Think: Storage)
--
-- Enables pgvector and creates the `system_topology_embeddings` table that
-- backs the agent's structural "blueprint" memory. Agents query this layer
-- (via cosine similarity on the `embedding` column) BEFORE writing routes,
-- schemas, or infrastructure code, so they reason against the real system
-- topology instead of guessing.
--
-- Resilient-First note: on Neon Postgres, enabling an extension is a one-time
-- DDL op. If `vector` is unavailable (e.g. a stripped-down/local Postgres),
-- the application degrades to an in-memory mock store and logs a warning —
-- it NEVER crashes server initialization. See services/memory/vectorStore.ts.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS system_topology_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cosine-distance index for fast ANN retrieval.
CREATE INDEX IF NOT EXISTS system_topology_embeddings_embedding_idx
  ON system_topology_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
