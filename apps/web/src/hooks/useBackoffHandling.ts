import { useState, useEffect, useRef, useCallback } from 'react';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQ = 100;
const INGEST_RATE_LIMIT_MAX_REQ = 50;
const SERVER_TIMEOUT_MS = 15_000;
const DB_QUERY_TIMEOUT_MS = 10_000;

const RATE_LIMIT_BACKOFF_MS = RATE_LIMIT_WINDOW_MS;
const SERVER_TIMEOUT_BACKOFF_MS = SERVER_TIMEOUT_MS;

interface BackoffState {
  frozen: boolean;
  retryAfterMs: number;
  frozenUntil: number | null;
}

export function useBackoffHandling() {
  const [state, setState] = useState<BackoffState>({
    frozen: false,
    retryAfterMs: RATE_LIMIT_BACKOFF_MS,
    frozenUntil: null
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBackoff = useCallback((retryAfterHeader?: string | null) => {
    const retryMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : RATE_LIMIT_BACKOFF_MS;
    const until = Date.now() + retryMs;
    setState({ frozen: true, retryAfterMs: retryMs, frozenUntil: until });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setState({ frozen: false, retryAfterMs: RATE_LIMIT_BACKOFF_MS, frozenUntil: null });
    }, retryMs);
  }, []);

  const onFetchError = useCallback((err: unknown) => {
    if (!(err instanceof Error)) return;
    if ((err as any).status === 429 || (err as any).isRateLimit) {
      triggerBackoff();
    }
    if ((err as any).status === 503 || err.message.includes('Service Unavailable')) {
      const until = Date.now() + SERVER_TIMEOUT_BACKOFF_MS;
      setState({ frozen: true, retryAfterMs: SERVER_TIMEOUT_BACKOFF_MS, frozenUntil: until });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setState({ frozen: false, retryAfterMs: RATE_LIMIT_BACKOFF_MS, frozenUntil: null });
      }, SERVER_TIMEOUT_BACKOFF_MS);
    }
  }, [triggerBackoff]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isFrozen: state.frozen, backoffState: state, onFetchError };
}

export { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQ, INGEST_RATE_LIMIT_MAX_REQ, SERVER_TIMEOUT_MS, DB_QUERY_TIMEOUT_MS };
