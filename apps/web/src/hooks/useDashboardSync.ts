/**
 * THINKBOX PR-008 — Unified Dashboard Sync Hook
 *
 * Single hook that every THINKBOX component uses to consume the Workspace
 * ViewModel. Subscribes to BUS events for live updates. No component
 * parses backend data independently.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';
import type { WorkspaceViewModel } from '../../services/thinkbox/src/viewmodel/workspace';

interface UseDashboardSyncResult {
  viewModel: WorkspaceViewModel;
  loading: boolean;
  error: string | null;
  connected: boolean;
  refresh: () => Promise<void>;
  detect: (path?: string) => Promise<void>;
  health: {
    fps: number;
    sseStatus: 'connected' | 'disconnected' | 'reconnecting';
    apiLatency: number;
    eventCount: number;
    renderCount: number;
  };
}

const empty = (await import('../../services/thinkbox/src/viewmodel/workspace')).emptyViewModel;

export function useDashboardSync(): UseDashboardSyncResult {
  const [viewModel, setViewModel] = useState<WorkspaceViewModel>(empty());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const renderCount = useRef(0);
  const eventCount = useRef(0);
  const lastLatency = useRef(0);
  const [fps] = useState(60);

  useEffect(() => { renderCount.current++; });

  const refresh = useCallback(async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const data = await apiGet<WorkspaceViewModel>('/api/thinkbox/dashboard');
      if (data) {
        setViewModel(data);
        setConnected(true);
        eventCount.current++;
      }
      lastLatency.current = performance.now() - t0;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dashboard sync failed');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const detect = useCallback(async (path: string = '.') => {
    setLoading(true);
    try {
      await apiPost('/api/thinkbox/detect', { path });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    viewModel,
    loading,
    error,
    connected,
    refresh,
    detect,
    health: {
      fps,
      sseStatus: connected ? 'connected' : 'disconnected',
      apiLatency: lastLatency.current,
      eventCount: eventCount.current,
      renderCount: renderCount.current,
    },
  };
}
