/**
 * THINKBOX PR-008 — Unified Workspace ViewModel
 *
 * Every visible dashboard panel consumes this single typed contract.
 * No component parses backend data independently. The ViewModel is
 * assembled server-side from Project Intelligence, the Engineering
 * Graph, mission state, and BUS events.
 */

export interface WorkspaceViewModel {
  workspace: {
    id: string;
    name: string;
    sourceType: 'git' | 'zip' | 'directory';
    state: 'created' | 'detected' | 'ready' | 'error';
    createdAt: string;
    lastActivity: string;
  };

  mission: {
    id: string;
    title: string;
    objective: string;
    status: 'draft' | 'active' | 'paused' | 'completed';
    priority: string;
    progress: number;
    confidence: number;
  };

  intelligence: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    runtimes: Array<{ kind: string; version: string | null }>;
    dependencies: Array<{
      manager: string;
      totalCount: number;
      lockfilePresent: boolean;
      direct: number;
      transitive: number;
    }>;
    services: Array<{ kind: string; name: string; sdk: string | null }>;
    env: Array<{ name: string; required: boolean; category: string }>;
    ci: string[];
    deploy: string[];
    totalFiles: number;
    packageCount: number;
    confidence: number;
  };

  engineeringGraph: {
    nodes: Array<{
      id: string;
      label: string;
      kind: string;
      confidence: number;
      connected: string[];
    }>;
    edges: Array<{ from: string; to: string; kind: string; label: string }>;
    rootId: string;
  };

  execution: {
    status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
    totalCommands: number;
    completedCount: number;
    failedCount: number;
    currentCommand: string | null;
    pendingApprovals: number;
    simulation: boolean;
  };

  timeline: Array<{
    id: string;
    type: string;
    timestamp: string;
    message: string;
    severity: 'info' | 'warn' | 'error' | 'success';
    agentId: string | null;
  }>;

  agents: Array<{
    name: string;
    role: string;
    status: 'active' | 'idle' | 'error';
    task: string;
    progress: number;
    lastEvent: string;
    health: 'healthy' | 'degraded' | 'unhealthy';
  }>;

  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: 'info' | 'success' | 'warn' | 'error';
    timestamp: string;
    read: boolean;
    actionable: boolean;
  }>;

  memory: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    timestamp: string;
    agent: string | null;
  }>;

  health: {
    readyScore: number;
    grade: string;
    busConnected: boolean;
    sseConnected: boolean;
    agentsOnline: number;
    agentsTotal: number;
    lastEventTimestamp: string;
    apiLatencyMs: number;
  };

  costs: {
    estimatedMonthly: number;
    currency: string;
    breakdown: Array<{ category: string; amount: number }>;
  };

  deployments: Array<{
    target: string;
    status: 'active' | 'inactive' | 'deploying';
    lastDeploy: string;
    version: string;
  }>;
}

export function emptyViewModel(): WorkspaceViewModel {
  return {
    workspace: { id: '', name: '', sourceType: 'directory', state: 'created', createdAt: '', lastActivity: '' },
    mission: { id: '', title: '', objective: '', status: 'draft', priority: 'P2', progress: 0, confidence: 0 },
    intelligence: { languages: [], frameworks: [], packageManagers: [], runtimes: [], dependencies: [], services: [], env: [], ci: [], deploy: [], totalFiles: 0, packageCount: 0, confidence: 0 },
    engineeringGraph: { nodes: [], edges: [], rootId: '' },
    execution: { status: 'idle', totalCommands: 0, completedCount: 0, failedCount: 0, currentCommand: null, pendingApprovals: 0, simulation: true },
    timeline: [],
    agents: [],
    notifications: [],
    memory: [],
    health: { readyScore: 0, grade: 'F', busConnected: false, sseConnected: false, agentsOnline: 0, agentsTotal: 6, lastEventTimestamp: '', apiLatencyMs: 0 },
    costs: { estimatedMonthly: 0, currency: 'USD', breakdown: [] },
    deployments: [],
  };
}
