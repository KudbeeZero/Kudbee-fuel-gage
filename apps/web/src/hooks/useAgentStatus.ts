import { apiGet } from '../../lib/apiClient';

export interface AgentStatus {
  id: string;
  online: boolean;
  lastSeen: string | null;
  ageSec: number | null;
  voicemails: number;
  totalVoicemails: number;
  fleetStatus?: string;
  fleetTask?: string;
  fleetUpdated?: string;
}

export interface AgentRoster {
  agents: AgentStatus[];
  online: number;
  total: number;
  unreadVoicemails: number;
  timestamp: string;
}

export async function fetchAgentStatus(): Promise<AgentRoster> {
  const data = await apiGet('/api/agents/status');
  return data as AgentRoster;
}
