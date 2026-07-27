import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

export interface AgentMemory {
  totalActions: number;
  lastAction: string | null;
  recallCount: number;
}

export interface AgentDecisions {
  total: number;
  lastDecision: string | null;
}

export interface FleetAgent {
  id: string;
  category: string;
  schedule: string;
  description: string;
  triggers: string;
  status: string;
  memory: AgentMemory;
  decisions: AgentDecisions;
}

export interface TopSnippet {
  id: string;
  size: number;
  recallCount: number;
}

export interface AgentStatusResponse {
  timestamp: string;
  agents: FleetAgent[];
  snippets: { total: number; totalSize: number; topRecalled: TopSnippet[] };
  decisions: { total: number; recent: Array<{ id: string; agentId: string; decision: string; timestamp: string }> };
  memories: { total: number; totalActions: number };
  knowledgeGraph: { nodes: number; edges: number };
  rateLimits: { global: { maxConcurrent: number; currentRunning: number; waitQueue: unknown[] } };
  waitQueue: { queued: unknown[]; processed: number };
  journal: { sessions: number; lastEntry: unknown | null };
}

export function useAgentStatus() {
  const [data, setData] = useState<AgentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<AgentStatusResponse>('/api/system/agent-status');
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch agent status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 8000);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
