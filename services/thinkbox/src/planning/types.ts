/**
 * THINKBOX PR-007 — Planning Types
 *
 * Defines the Mission Graph, Engineering Graph, and planning primitives.
 */

export type MissionStatus = 'draft' | 'active' | 'paused' | 'completed' | 'blocked';

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';

export interface MissionObjective {
  id: string;
  title: string;
  description: string;
  status: MissionStatus;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  complexity: TaskComplexity;
  estimatedDurationMs: number;
  confidence: number;
}

export interface Task {
  id: string;
  missionId: string;
  epicId: string | null;
  parentId: string | null;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  definitionOfDone: string[];
  requiredTests: string[];
  risk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  complexity: TaskComplexity;
  estimatedDurationMs: number;
  suggestedAgent: string;
  assignedAgent: string | null;
  assignedConfidence: number;
  status: 'queued' | 'in-progress' | 'review' | 'completed' | 'blocked';
  dependsOn: string[];
  blocks: string[];
  filesInvolved: string[];
  confidence: number;
}

export interface Epic {
  id: string;
  missionId: string;
  title: string;
  description: string;
  tasks: Task[];
  status: MissionStatus;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  confidence: number;
}

export interface MissionGraph {
  missionId: string;
  objective: MissionObjective;
  epics: Epic[];
  tasks: Task[];
  dependencies: Array<{ from: string; to: string; type: 'depends_on' | 'blocks' | 'verifies' | 'enables' }>;
  risks: Array<{ id: string; description: string; severity: 'low' | 'medium' | 'high'; mitigation: string; linkedTaskIds: string[] }>;
  estimatedTotalDurationMs: number;
  requiredAgents: Array<{ name: string; reason: string; confidence: number }>;
  suggestedExecutionOrder: string[];
  completionCriteria: string[];
  generatedAt: string;
  confidence: number;
}

export type EngineeringNodeKind =
  | 'workspace' | 'mission' | 'pr' | 'branch' | 'file' | 'service'
  | 'api' | 'database' | 'dependency' | 'test' | 'documentation'
  | 'agent' | 'decision' | 'risk' | 'deployment' | 'epic' | 'task';

export type EngineeringEdgeKind =
  | 'depends_on' | 'owns' | 'modifies' | 'verifies' | 'deploys'
  | 'documents' | 'discovers' | 'blocks' | 'replaces' | 'enables'
  | 'implements' | 'tests' | 'contains';

export interface EngineeringNode {
  id: string;
  label: string;
  kind: EngineeringNodeKind;
  properties: Record<string, unknown>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: string;
    confidence: number;
    agentId: string | null;
  };
}

export interface EngineeringEdge {
  id: string;
  from: string;
  to: string;
  kind: EngineeringEdgeKind;
  label: string;
  properties: Record<string, unknown>;
  metadata: {
    createdAt: string;
    source: string;
    confidence: number;
  };
}

export interface EngineeringGraph {
  nodes: EngineeringNode[];
  edges: EngineeringEdge[];
  query(predicate: (node: EngineeringNode) => boolean): EngineeringNode[];
  traverse(startId: string, kind?: EngineeringEdgeKind): EngineeringNode[];
  connected(id: string): EngineeringNode[];
  impactAnalysis(nodeId: string): ImpactAnalysisResult;
}

export interface ImpactAnalysisResult {
  affectedNodes: EngineeringNode[];
  affectedEdges: EngineeringEdge[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface DecisionRecord {
  id: string;
  title: string;
  description: string;
  category: 'architecture' | 'implementation' | 'testing' | 'deployment' | 'security' | 'dependency' | 'risk';
  evidence: string[];
  alternatives: string[];
  reasoning: string;
  risks: string[];
  affectedFiles: string[];
  linkedMissionId: string | null;
  linkedTaskId: string | null;
  agentId: string | null;
  timestamp: string;
  confidence: number;
}

export interface AgentSkillProfile {
  agentName: string;
  skills: string[];
  expertise: Record<string, number>;
  taskHistory: Array<{ taskId: string; complexity: TaskComplexity; success: boolean; durationMs: number }>;
  currentLoad: number;
  maxConcurrent: number;
}

export interface ExplainabilityReport {
  recommendation: string;
  why: string;
  evidence: Array<{ source: string; relevance: string }>;
  alternatives: Array<{ option: string; pros: string[]; cons: string[] }>;
  risks: string[];
  affectedFiles: string[];
  contributingAgents: string[];
  confidence: number;
}
