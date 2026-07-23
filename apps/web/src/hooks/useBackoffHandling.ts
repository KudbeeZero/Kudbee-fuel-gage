import { useState, useEffect, useRef, useCallback } from 'react';

interface BackoffState {
  frozen: boolean;
  retryAfterMs: number;
  frozenUntil: number | null;
}

export function useBackoffHandling() {
  const [state, setState] = useState<BackoffState>({
    frozen: false,
    retryAfterMs: 30_000,
    frozenUntil: null
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBackoff = useCallback((retryAfterHeader?: string | null) => {
    const retryMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : 30_000;
    const until = Date.now() + retryMs;
    setState({ frozen: true, retryAfterMs: retryMs, frozenUntil: until });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setState({ frozen: false, retryAfterMs: 30_000, frozenUntil: null });
    }, retryMs);
  }, []);

  const onFetchError = useCallback((err: unknown) => {
    if (!(err instanceof Error)) return;
    if ((err as any).status === 429 || (err as any).isRateLimit) {
      triggerBackoff();
    }
    if ((err as any).status === 503 || err.message.includes('Service Unavailable')) {
      const retryMs = 10_000;
      const until = Date.now() + retryMs;
      setState({ frozen: true, retryAfterMs: retryMs, frozenUntil: until });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setState({ frozen: false, retryAfterMs: 30_000, frozenUntil: null });
      }, retryMs);
    }
  }, [triggerBackoff]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isFrozen: state.frozen, backoffState: state, onFetchError };
}
