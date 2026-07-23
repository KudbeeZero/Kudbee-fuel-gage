import { Network, Server, Database, Cpu, Brain, Shield, Radio } from 'lucide-react';

export interface TopologyNode {
  x: number;
  y: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'online' | 'degraded' | 'offline';
  agentId?: string;
}

export const NODE_POSITIONS: TopologyNode[] = [
  { x: 50, y: 180, label: 'INGRESS', icon: Network, status: 'online' },
  { x: 220, y: 60, label: 'HERMES', icon: Brain, status: 'online', agentId: 'hermes' },
  { x: 220, y: 180, label: 'GATEWAY', icon: Shield, status: 'online' },
  { x: 220, y: 300, label: 'SENTINEL', icon: Radio, status: 'online', agentId: 'sentinel' },
  { x: 400, y: 120, label: 'CRUCIBLE', icon: Cpu, status: 'online', agentId: 'crucible' },
  { x: 400, y: 240, label: 'REDIS', icon: Database, status: 'online' },
  { x: 550, y: 180, label: 'LLM', icon: Server, status: 'online' },
];

export const EDGES: Array<[number, number, string]> = [
  [0, 2, '#3b82f6'],
  [2, 1, '#8b5cf6'],
  [2, 3, '#06b6d4'],
  [1, 4, '#f59e0b'],
  [3, 4, '#10b981'],
  [4, 5, '#ef4444'],
  [5, 6, '#ec4899'],
  [3, 6, '#6366f1'],
  [1, 6, '#14b8a6'],
];
