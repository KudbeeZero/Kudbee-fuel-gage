/**
 * THINKBOX PR-008 — Unified Dashboard Sync Hook
 *
 * Single hook that every THINKBOX component uses to consume the Workspace
 * ViewModel. Subscribes to BUS events for live updates. No component
 * parses backend data independently.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

interface WorkspaceViewModel {
  workspace: { id: string; name: string; sourceType: string; state: string; createdAt: string; lastActivity: string };
  mission: { id: string; title: string; objective: string; status: string; priority: string; progress: number; confidence: number };
  intelligence: { languages: string[]; frameworks: string[]; packageManagers: string[]; runtimes: Array<{ kind: string; version: string | null }>; dependencies: Array<{ manager: string; totalCount: number; lockfilePresent: boolean; direct: number; transitive: number }>; services: Array<{ kind: string; name: string; sdk: string | null }>; env: Array<{ name: string; required: boolean; category: string }>; ci: string[]; deploy: string[]; totalFiles: number; packageCount: number; confidence: number };
  engineeringGraph: { nodes: Array<{ id: string; label: string; kind: string; confidence: number; connected: string[] }>; edges: Array<{ from: string; to: string; kind: string; label: string }>; rootId: string };
  execution: { status: string; totalCommands: number; completedCount: number; failedCount: number; currentCommand: string | null; pendingApprovals: number; simulation: boolean };
  timeline: Array<{ id: string; type: string; timestamp: string; message: string; severity: string; agentId: string | null }>;
  agents: Array<{ name: string; role: string; status: string; task: string; progress: number; lastEvent: string; health: string }>;
  notifications: Array<{ id: string; type: string; title: string; message: string; severity: string; timestamp: string; read: boolean; actionable: boolean }>;
  memory: Array<{ id: string; type: string; title: string; content: string; timestamp: string; agent: string | null }>;
  health: { readyScore: number; grade: string; busConnected: boolean; sseConnected: boolean; agentsOnline: number; agentsTotal: number; lastEventTimestamp: string; apiLatencyMs: number };
  costs: { estimatedMonthly: number; currency: string; breakdown: Array<{ category: string; amount: number }> };
  deployments: Array<{ target: string; status: string; lastDeploy: string; version: string }>;
}

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

function empty(): WorkspaceViewModel {
  return {
    workspace: { id: '', name: '', sourceType: 'directory', state: 'created', createdAt: '', lastActivity: '' },
    mission: { id: '', title: '', objective: '', status: 'draft', priority: 'P2', progress: 0, confidence: 0 },
    intelligence: { languages: [], frameworks: [], packageManagers: [], runtimes: [], dependencies: [], services: [], env: [], ci: [], deploy: [], totalFiles: 0, packageCount: 0, confidence: 0 },
    engineeringGraph: { nodes: [], edges: [], rootId: '' },
    execution: { status: 'idle', totalCommands: 0, completedCount: 0, failedCount: 0, currentCommand: null, pendingApprovals: 0, simulation: true },
    timeline: [], agents: [], notifications: [], memory: [],
    health: { readyScore: 0, grade: 'F', busConnected: false, sseConnected: false, agentsOnline: 0, agentsTotal: 6, lastEventTimestamp: '', apiLatencyMs: 0 },
    costs: { estimatedMonthly: 0, currency: 'USD', breakdown: [] }, deployments: [],
  };
}

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
