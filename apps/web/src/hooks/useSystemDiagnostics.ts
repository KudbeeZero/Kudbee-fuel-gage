import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface DiagnosticServices {
  postgres: { status: string; latencyMs: number | null; lastPing: string | null; poolInfo: Record<string, unknown> | null };
  redis: { status: string; latencyMs: number | null; lastPing: string | null; info: string | null };
}

export interface DiagnosticReport {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  summary: Record<string, string>;
  services: DiagnosticServices;
  routerProviders: Array<{ id: string; status: string; latencyMs: number | null; lastError: string | null }>;
  logBuffer: { detail: string };
  vectorIndex: { detail: string };
  governanceLedger: boolean;
}

export function useSystemDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DiagnosticReport>('/api/system/diagnostics');
      setDiagnostics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diagnostic probe failed');
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    await loadDiagnostics();
    setRunning(false);
  }, [loadDiagnostics]);

  useEffect(() => {
    void loadDiagnostics();
    const id = setInterval(() => void loadDiagnostics(), 15000);
    return () => clearInterval(id);
  }, [loadDiagnostics]);

  return { diagnostics, loading, error, running, runDiagnostics, refresh: loadDiagnostics };
}
