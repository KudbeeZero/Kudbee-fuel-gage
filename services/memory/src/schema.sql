-- Vector Memory Layer Schema
-- Portable across SQLite (development) and PostgreSQL + pgvector (production)

-- Primary vector memory store
CREATE TABLE IF NOT EXISTS vector_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  context_type TEXT NOT NULL DEFAULT 'telemetry',
  payload JSONB NOT NULL DEFAULT '{}',
  embedding TEXT NOT NULL DEFAULT '[]'
);

-- Index for timestamp-based retrieval
CREATE INDEX IF NOT EXISTS idx_vector_memory_timestamp ON vector_memory(timestamp);

-- Index for context type filtering
CREATE INDEX IF NOT EXISTS idx_vector_memory_context_type ON vector_memory(context_type);

-- Note: For PostgreSQL + pgvector production deployments:
-- 1. Replace `embedding TEXT` with `embedding vector(256)` or appropriate dimension
-- 2. Create IVFFlat index for approximate nearest neighbor:
--    CREATE INDEX IF NOT EXISTS idx_vector_memory_embedding ON vector_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- 3. Use `SELECT * FROM vector_memory ORDER BY embedding <=> ? LIMIT ?` for KNN queries
