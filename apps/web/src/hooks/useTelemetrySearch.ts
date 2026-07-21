import { useState, useCallback, useEffect } from 'react';
import { apiGet } from '../lib/apiClient';

export interface SearchHit {
  id: number;
  traceId: string;
  model: string;
  provider: string;
  status: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  timestamp: string;
  projectName?: string;
}

export interface SearchResponse {
  query: Record<string, unknown>;
  total: number;
  results: SearchHit[];
}

export interface SearchState {
  query: string;
  traceId: string;
  provider: string;
  verdict: string;
  from: string;
  to: string;
  limit: number;
}

export function useTelemetrySearch() {
  const [filters, setFilters] = useState<SearchState>({
    query: '',
    traceId: '',
    provider: '',
    verdict: '',
    from: '',
    to: '',
    limit: 50
  });
  const [results, setResults] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFilter = useCallback((patch: Partial<SearchState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.query) params.set('q', filters.query);
      if (filters.traceId) params.set('traceId', filters.traceId);
      if (filters.provider) params.set('provider', filters.provider);
      if (filters.verdict) params.set('verdict', filters.verdict);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      params.set('limit', String(filters.limit));

      const data = await apiGet<SearchResponse>(`/api/telemetry/search?${params.toString()}`);
      setResults(Array.isArray(data?.results) ? data.results : []);
      setTotal(data?.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const id = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(id);
  }, [filters.query, filters.traceId, filters.provider, filters.verdict, filters.from, filters.to, filters.limit, runSearch]);

  return { filters, updateFilter, results, total, loading, error, runSearch };
}
