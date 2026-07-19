-- services/ingestion/migrations/002_telemetry_logs_and_user_memories_ttl.sql
-- ---------------------------------------------------------------------------
-- 30-Day Time-To-Live (TTL) policy for Neon Postgres.
--
-- This migration:
--   1. Ensures the `telemetry_logs` and `user_memories` tables exist with the
--      canonical schema (idempotent — safe to re-apply).
--   2. Installs a `purge_expired_rows()` cleanup function that deletes rows
--      older than 30 days from both tables.
--   3. Schedules that function via pg_cron to run daily at 02:00 UTC (the
--      canonical Neon TTL mechanism). If pg_cron is unavailable in your
--      Neon plan, call `SELECT purge_expired_rows();` from an external cron.
--
-- Apply this migration with the Neon MCP server (`@neondatabase/mcp-server`)
-- or via `psql "$DATABASE_URL" -f 002_telemetry_logs_and_user_memories_ttl.sql`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telemetry_logs (
  id            BIGSERIAL PRIMARY KEY,
  trace_id      TEXT NOT NULL,
  model         TEXT NOT NULL DEFAULT 'unknown',
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  cost          DOUBLE PRECISION NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'OK',
  provider      TEXT,
  project_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_logs_created_at
  ON telemetry_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_trace_id
  ON telemetry_logs (trace_id);

CREATE TABLE IF NOT EXISTS user_memories (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      TEXT,
  thought_summary TEXT NOT NULL DEFAULT '',
  reasoning     TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT 'unknown',
  embedding     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memories_created_at
  ON user_memories (created_at);

-- "Think" layer: chain-of-thought archival (see services/agents/hermes.js
-- archive_thought). Subject to the same 30-day TTL as the other memory tables.
CREATE TABLE IF NOT EXISTS think (
  id         BIGSERIAL PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  task       TEXT,
  phase      TEXT,
  thought    TEXT NOT NULL,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  model      TEXT NOT NULL DEFAULT 'reasoning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_think_created_at
  ON think (created_at);

-- TTL retention window: rows older than this are purged automatically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ttl_window'
  ) THEN
    CREATE DOMAIN ttl_window AS INTERVAL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION purge_expired_rows()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  retention INTERVAL := INTERVAL '30 days';
BEGIN
  DELETE FROM telemetry_logs
  WHERE created_at < (CURRENT_TIMESTAMP - retention);

  DELETE FROM user_memories
  WHERE created_at < (CURRENT_TIMESTAMP - retention);

  DELETE FROM think
  WHERE created_at < (CURRENT_TIMESTAMP - retention);
END;
$$;

-- Schedule the daily purge via pg_cron when the extension is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Avoid duplicate schedules on re-apply.
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'ttl-purge-telemetry-and-memories'
    ) THEN
      PERFORM cron.schedule(
        'ttl-purge-telemetry-and-memories',
        '0 2 * * *',
        'SELECT purge_expired_rows()'
      );
    END IF;

    RAISE NOTICE '[migration] pg_cron schedule "ttl-purge-telemetry-and-memories" ensured (daily 02:00 UTC).';
  ELSE
    RAISE NOTICE '[migration] pg_cron extension unavailable — call SELECT purge_expired_rows() manually or via external cron.';
  END IF;
END $$;
