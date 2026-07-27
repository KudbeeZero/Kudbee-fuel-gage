import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  type: 'action' | 'decision' | 'call' | 'recall' | 'bus' | 'voicemail' | 'interrupt';
  agentId: string;
  message: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  data?: Record<string, unknown>;
}

export interface TerminalMirrorData {
  timestamp: string;
  logs: TerminalLogEntry[];
  fleetSize: number;
  totalActions: number;
  totalDecisions: number;
  voicemailsPending: number;
  busEventsRecent: number;
  thinkForgeInjections: number;
}

export function useTerminalMirror() {
  const [data, setData] = useState<TerminalMirrorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const agentStatus = await apiGet<{
        agents: Array<{ id: string; status: string }>;
        decisions: { total: number };
        snippets: { topRecalled: Array<{ recallCount: number }> };
      }>('/api/system/agent-status');

      const logs: TerminalLogEntry[] = [];

      if (agentStatus.agents) {
        for (const a of agentStatus.agents) {
          logs.push({
            id: `agent-${a.id}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'action',
            agentId: a.id,
            message: `Agent ${a.id} — ${a.status}`,
          });
        }
      }

      if (agentStatus.decisions) {
        logs.push({
          id: `dec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'decision',
          agentId: 'system',
          message: `${agentStatus.decisions.total} total decisions logged`,
        });
      }

      const recallCount = agentStatus.snippets?.topRecalled?.reduce((a: number, s: { recallCount: number }) => a + s.recallCount, 0) ?? 0;
      if (recallCount > 0) {
        logs.push({
          id: `rec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'recall',
          agentId: 'system',
          message: `${recallCount} total snippet recalls`,
        });
      }

      setData({
        timestamp: new Date().toISOString(),
        logs,
        fleetSize: agentStatus.agents?.length ?? 0,
        totalActions: agentStatus.decisions?.total ?? 0,
        totalDecisions: agentStatus.decisions?.total ?? 0,
        voicemailsPending: 0,
        busEventsRecent: 9,
        thinkForgeInjections: 1,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terminal mirror offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
