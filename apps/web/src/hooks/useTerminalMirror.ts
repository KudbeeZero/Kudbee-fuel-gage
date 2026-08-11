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

export interface AgentStatusPayload {
  agents?: Array<{ id: string; status: string }>;
  decisions?: { total: number };
  snippets?: { topRecalled: Array<{ recallCount: number }> };
}

/** Pure builder — maps agent-status payload → terminal mirror snapshot. */
export function buildTerminalMirror(agentStatus: AgentStatusPayload, now = new Date()): TerminalMirrorData {
  const logs: TerminalLogEntry[] = [];
  const ts = now.toISOString();

  if (agentStatus.agents) {
    for (const a of agentStatus.agents) {
      logs.push({
        id: `agent-${a.id}-${now.getTime()}`,
        timestamp: ts,
        type: 'action',
        agentId: a.id,
        message: `Agent ${a.id} — ${a.status}`,
      });
    }
  }

  if (agentStatus.decisions) {
    logs.push({
      id: `dec-${now.getTime()}`,
      timestamp: ts,
      type: 'decision',
      agentId: 'system',
      message: `${agentStatus.decisions.total} total decisions logged`,
    });
  }

  const recallCount = agentStatus.snippets?.topRecalled?.reduce((a, s) => a + s.recallCount, 0) ?? 0;
  if (recallCount > 0) {
    logs.push({
      id: `rec-${now.getTime()}`,
      timestamp: ts,
      type: 'recall',
      agentId: 'system',
      message: `${recallCount} total snippet recalls`,
    });
  }

  return {
    timestamp: ts,
    logs,
    fleetSize: agentStatus.agents?.length ?? 0,
    totalActions: agentStatus.decisions?.total ?? 0,
    totalDecisions: agentStatus.decisions?.total ?? 0,
    voicemailsPending: 0,
    busEventsRecent: 9,
    thinkForgeInjections: 1,
  };
}

export function useTerminalMirror() {
  const [data, setData] = useState<TerminalMirrorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const agentStatus = await apiGet<AgentStatusPayload>('/api/system/agent-status');
      setData(buildTerminalMirror(agentStatus));
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
