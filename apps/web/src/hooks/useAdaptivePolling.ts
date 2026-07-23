import { useEffect, useRef, useState } from 'react';

type HealthLevel = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

function getHealthMultiplier(level: HealthLevel): number {
  switch (level) {
    case 'HEALTHY': return 1;
    case 'DEGRADED': return 2;
    case 'OFFLINE': return 4;
  }
}

export function useAdaptivePolling(
  callback: () => void,
  baseIntervalMs: number,
  healthLevel: HealthLevel
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const [, forceTick] = useState(0);

  useEffect(() => {
    const multiplier = getHealthMultiplier(healthLevel);
    const interval = Math.max(1000, Math.round(baseIntervalMs * multiplier));

    const id = setInterval(() => {
      callbackRef.current();
      forceTick((n) => n + 1);
    }, interval);

    return () => clearInterval(id);
  }, [baseIntervalMs, healthLevel]);
}
