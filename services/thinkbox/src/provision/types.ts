/**
 * THINKBOX PR-003 — Workspace Provisioning Engine
 *
 * Core type definitions for the provisioning layer. Takes the Project Intelligence
 * Manifest from PR-002 and produces a deterministic execution plan. Nothing executes
 * until simulation mode is manually toggled off.
 */

import type { DependencyInfo, EnvVarRequirement, RuntimeInfo, ServiceInfo, ScriptsInfo } from '../intelligence/types.ts';

export type ProvisionPhase =
  | 'pending'
  | 'runtime_detection'
  | 'dependency_install'
  | 'service_setup'
  | 'env_config'
  | 'build'
  | 'test'
  | 'deploy'
  | 'ready';

export type ProvisionStatus = 'queued' | 'running' | 'complete' | 'failed' | 'skipped';

export interface ProvisionStep {
  id: string;
  phase: ProvisionPhase;
  label: string;
  command: string | null;
  status: ProvisionStatus;
  reason: string;
  dependsOn: string[];
  evidence: string[];
  risk: 'none' | 'low' | 'medium' | 'high';
  estimatedDurationMs: number | null;
}

export interface DependencyNode {
  id: string;
  label: string;
  kind: 'runtime' | 'package-manager' | 'service' | 'env-var' | 'ci' | 'deploy' | 'framework' | 'language';
  version: string | null;
  present: boolean;
  required: boolean;
  children: string[];
  detail: Record<string, unknown>;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: Array<{ from: string; to: string; label: string }>;
  rootId: string;
}

export interface ProvisionTimelineEvent {
  id: string;
  timestamp: string;
  phase: ProvisionPhase;
  message: string;
  status: ProvisionStatus;
  detail: string | null;
  agentId: string;
}

export interface WorkspaceReadyScore {
  total: number;
  runtime: number;
  dependencies: number;
  environment: number;
  ci: number;
  deploy: number;
  documentation: number;
  risk: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: Record<string, { score: number; maxScore: number; issues: string[] }>;
  recommendedNextAction: string;
}

export interface WorkspaceProvisionPlan {
  workspaceId: string;
  plannedAt: string;
  summary: string;
  phases: Record<ProvisionPhase, ProvisionStep[]>;
  orderedSteps: string[];
  graph: DependencyGraph;
  timeline: ProvisionTimelineEvent[];
  readyScore: WorkspaceReadyScore;
  simulation: boolean;
  totalSteps: number;
  estimatedTotalDurationMs: number;
  warnings: string[];
  risks: Array<{ severity: 'low' | 'medium' | 'high'; message: string }>;
}
