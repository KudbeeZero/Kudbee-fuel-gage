/**
 * THINKBOX PR-006 — Workspace types
 */

export interface WorkspaceMission {
  id: string;
  title: string;
  objective: string;
  status: 'active' | 'paused' | 'completed' | 'blocked';
  branch: string;
  prNumber: number | null;
  stackPosition: number;
  assignedAgents: string[];
  progress: number;
  remainingTasks: number;
  blockers: string[];
  risks: Array<{ severity: 'low' | 'medium' | 'high'; message: string }>;
  startedAt: string;
  completedAt: string | null;
  summary: string;
}

export interface WorkspaceMemory {
  id: string;
  type: 'decision' | 'agent-summary' | 'file-modification' | 'test-result' | 'error' | 'recovery' | 'recommendation';
  title: string;
  content: string;
  agent: string | null;
  timestamp: string;
  tags: string[];
  searchable: boolean;
}

export interface Notification {
  id: string;
  type: 'agent-completed' | 'approval-required' | 'test-failed' | 'recovery-succeeded' | 'deployment-available' | 'workspace-ready' | 'error' | 'info';
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warn' | 'error';
  timestamp: string;
  read: boolean;
  actionable: boolean;
  action?: { label: string; handler: string };
  source: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  panels: string[];
  commands: Array<{ name: string; description: string }>;
  eventHandlers: string[];
  providerKinds: string[];
  agentExtensions: string[];
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: 'installed' | 'enabled' | 'disabled' | 'error';
  installedAt: string;
  lastError: string | null;
}

export interface ExplorerNode {
  id: string;
  label: string;
  kind: 'file' | 'directory' | 'service' | 'database' | 'cache' | 'ai-provider' | 'deploy' | 'ci' | 'dependency' | 'runtime' | 'memory';
  path: string;
  children: ExplorerNode[];
  metadata: Record<string, unknown>;
}
