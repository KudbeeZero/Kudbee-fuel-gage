-- KNN Similarity Search Functions
-- Portable across SQLite (in-memory) and PostgreSQL + pgvector

-- SQLite: In-memory cosine similarity search
-- Since SQLite lacks native vector operations, we compute similarity in application code.
-- This view provides a convenient interface for ordered retrieval.

CREATE VIEW IF NOT EXISTS vector_memory_search AS
SELECT
  id,
  timestamp,
  context_type,
  payload,
  embedding
FROM vector_memory
ORDER BY timestamp DESC;

-- PostgreSQL + pgvector: Native KNN search function
-- Uncomment and use in production:

-- CREATE OR REPLACE FUNCTION search_similar_vectors(
--   query_embedding vector(256),
--   match_threshold float DEFAULT 0.7,
--   match_count int DEFAULT 5,
--   context_filter text DEFAULT NULL
-- )
-- RETURNS TABLE (
--   id integer,
--   timestamp text,
--   context_type text,
--   payload jsonb,
--   embedding vector(256),
--   similarity float
-- )
-- LANGUAGE sql STABLE
-- AS $$
--   SELECT
--     vm.id,
--     vm.timestamp,
--     vm.context_type,
--     vm.payload,
--     vm.embedding,
--     1 - (vm.embedding <=> query_embedding) AS similarity
--   FROM vector_memory vm
--   WHERE
--     (context_filter IS NULL OR vm.context_type = context_filter)
--     AND 1 - (vm.embedding <=> query_embedding) > match_threshold
--   ORDER BY vm.embedding <=> query_embedding
--   LIMIT match_count;
-- $$;

-- Note: The `<=>` operator computes cosine distance (1 - cosine similarity).
-- For L2 distance, use `<->` instead.
-- Adjust `match_threshold` based on your embedding model and quality requirements.
