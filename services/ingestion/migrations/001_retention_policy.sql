-- services/ingestion/migrations/001_retention_policy.sql
-- ---------------------------------------------------------------------------
-- Retention Policy: automatically purge records older than 30 days.
--
-- For Neon Postgres, the recommended approach is pg_cron.
-- Enable pg_cron in your Neon dashboard, then run:
--
--   SELECT cron.schedule('cleanup-old-telemetry', '0 2 * * *', 'SELECT cleanup_old_telemetry()');
--
-- This schedules the cleanup function to run daily at 02:00 UTC.
-- If you prefer an external cron, call the function directly:
--   SELECT cleanup_old_telemetry();
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanup_old_telemetry()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM telemetry_traces
  WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';

  DELETE FROM security_violations
  WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';

  DELETE FROM telemetry_vectors
  WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$;

-- Optional: create a cron job automatically if pg_cron is available
-- Uncomment after enabling pg_cron in Neon:
-- SELECT cron.schedule(
--   'cleanup-old-telemetry',
--   '0 2 * * *',
--   'SELECT cleanup_old_telemetry()'
-- );
