-- 004_reasoning_ledger.sql
-- ---------------------------------------------------------------------------
-- Reasoning Ledger: durable capture of Problem-Result pairs for agent
-- self-improvement. Each agent turn is recorded with its operating context
-- (system prompt), the telemetry input, the chain-of-thought (thought stream),
-- the final outcome, and the result status.
--
-- When Neon is unreachable at write time the ingestion/agent layers queue the
-- entry to Upstash Redis (ledger:queue) and replay it on reconnect. This table
-- is the system of record when Neon is healthy.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reasoning_ledger (
  id            BIGSERIAL PRIMARY KEY,
  context       TEXT        NOT NULL,
  input         JSONB       NOT NULL,
  thought_stream JSONB      NOT NULL,
  output        JSONB       NOT NULL,
  result_status TEXT        NOT NULL DEFAULT 'SUCCESS',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reasoning_ledger_created_at
  ON reasoning_ledger (created_at);
