import { useRef, useCallback } from 'react';

export function useRateThrottle(maxRequestsPerMinute: number) {
  const tokensRef = useRef(maxRequestsPerMinute);
  const lastRefillRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!timerRef.current) {
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastRefillRef.current) / 1000;
      const refillRate = maxRequestsPerMinute / 60;
      tokensRef.current = Math.min(maxRequestsPerMinute, tokensRef.current + elapsed * refillRate);
      lastRefillRef.current = now;
    }, 1000);
  }

  const tryConsume = useCallback((): boolean => {
    if (tokensRef.current >= 1) {
      tokensRef.current -= 1;
      return true;
    }
    return false;
  }, []);

  const available = useCallback(() => tokensRef.current, []);

  return { tryConsume, available };
}
