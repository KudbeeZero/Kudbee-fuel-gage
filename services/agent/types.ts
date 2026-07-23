/**
 * services/agent/types.ts
 * ---------------------------------------------------------------------------
 * Strict TypeScript interfaces for the multi-agent orchestration system.
 * All message-passing between supervisor and workers uses these types.
 */

// ── Sub-agent role taxonomy ────────────────────────────────────────────────
export type SubAgentRole =
  | 'CodeAnalyzer'
  | 'SecurityScanner'
  | 'TestRunner'
  | 'DependencyChecker'
  | 'DocumentationGenerator'
  | 'TypescriptValidator';

// ── Domain types ───────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  role: SubAgentRole;
  prompt: string;
  context?: { filePath?: string; workspaceRoot: string };
}

export interface WorkerMessage {
  type: 'task' | 'result' | 'think' | 'error' | 'progress';
  taskId: string;
  role: SubAgentRole;
  payload: unknown;
  timestamp: string;
}

export interface TaskResult {
  taskId: string;
  role: SubAgentRole;
  success: boolean;
  output: string;
  thinking?: string;
  duration: number;
  error?: string;
}

export interface DAGNode {
  task: SubTask;
  dependencies: string[]; // taskIds this node depends on
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
}
