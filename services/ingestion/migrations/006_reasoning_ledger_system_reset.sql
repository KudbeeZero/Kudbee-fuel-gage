-- 006_reasoning_ledger_system_reset.sql
-- ---------------------------------------------------------------------------
-- Reasoning Ledger: add event_type and reason columns to support SYSTEM_RESET
-- lifecycle events. These allow operators to distinguish between emergency
-- failures and routine service cycles (Redis reconnect, port reset, etc.).
-- ---------------------------------------------------------------------------

ALTER TABLE reasoning_ledger
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'reasoning';

ALTER TABLE reasoning_ledger
  ADD COLUMN IF NOT EXISTS reason TEXT;
