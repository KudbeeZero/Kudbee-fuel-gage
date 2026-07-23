import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/apiClient';

interface BudgetStatus {
  spendUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  pct: number;
  monthReset: string;
}

const DEFAULT_STATUS: BudgetStatus = {
  spendUsd: 0,
  budgetUsd: 50,
  remainingUsd: 50,
  pct: 0,
  monthReset: '',
};

let _cached: BudgetStatus | null = null;
let _lastFetch = 0;
const CACHE_TTL_MS = 60_000;
let _activeFetch: Promise<BudgetStatus> | null = null;

async function fetchBudgetStatus(): Promise<BudgetStatus> {
  if (_activeFetch) return _activeFetch;

  _activeFetch = apiGet<BudgetStatus>('/api/metrics/budget-status')
    .then((d) => {
      _cached = d;
      _lastFetch = Date.now();
      return d;
    })
    .catch(() => _cached ?? DEFAULT_STATUS)
    .finally(() => { _activeFetch = null; });

  return _activeFetch;
}

export function useBudgetStatus(): BudgetStatus {
  const [status, setStatus] = useState<BudgetStatus>(_cached ?? DEFAULT_STATUS);
  const _mountedRef = useRef(true);

  useEffect(() => {
    _mountedRef.current = true;

    const load = async () => {
      const now = Date.now();
      if (_cached && now - _lastFetch < CACHE_TTL_MS) {
        if (_mountedRef.current) setStatus(_cached);
        return;
      }

      const data = await fetchBudgetStatus();
      if (_mountedRef.current) setStatus(data);
    };

    void load();

    const id = setInterval(() => void load(), CACHE_TTL_MS);
    return () => {
      _mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  return status;
}
