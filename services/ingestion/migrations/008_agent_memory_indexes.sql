-- services/ingestion/migrations/008_agent_memory_indexes.sql
-- ---------------------------------------------------------------------------
-- Canonical indexes for agent learning and history retrieval.
--
-- Every statement is idempotent. HNSW indexes are attempted in an isolated DO
-- block because older or restricted pgvector installations may not expose the
-- HNSW access method. The B-tree history indexes remain available either way.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_memories_agent_created_at
  ON user_memories (agent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_think_agent_created_at
  ON think (agent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_think_tokens_status_created_at
  ON think_tokens (status, created_at);

CREATE INDEX IF NOT EXISTS idx_think_tokens_original_trace_id
  ON think_tokens (original_trace_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_traces_trace_id
  ON telemetry_traces (trace_id);

CREATE INDEX IF NOT EXISTS idx_governance_actions_agent_timestamp
  ON governance_actions (agent_id, timestamp);

CREATE INDEX IF NOT EXISTS vector_memory_metadata_agent_id_idx
  ON vector_memory ((metadata->>'agent_id'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
    EXECUTE $hnsw$
      CREATE INDEX IF NOT EXISTS vector_memory_embedding_idx
        ON vector_memory
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    $hnsw$;

    EXECUTE $hnsw$
      CREATE INDEX IF NOT EXISTS think_tokens_embedding_idx
        ON think_tokens
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    $hnsw$;
  END IF;
END $$;
