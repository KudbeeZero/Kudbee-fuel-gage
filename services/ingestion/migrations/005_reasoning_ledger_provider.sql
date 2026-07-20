-- 005_reasoning_ledger_provider.sql
-- ---------------------------------------------------------------------------
-- Reasoning Ledger: add provider tag so we can attribute each reasoning
-- chain to its intelligence core (Gemini cloud, VLLM edge, etc.).
--
-- Safe to run once on existing databases. The column is nullable/defaulted
-- to 'unknown' for historical rows and future writes that omit the provider.
-- ---------------------------------------------------------------------------

ALTER TABLE reasoning_ledger
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'unknown';
