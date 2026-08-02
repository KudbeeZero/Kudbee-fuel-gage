/**
 * THINKBOX PR-009 — Learning Types
 *
 * Every completed mission produces structured learning. Learning records
 * become actionable feedback that improves future engineering decisions.
 */

export interface LearningRecord {
  id: string;
  context: {
    missionId: string | null;
    workspaceId: string;
    epics: string[];
    agents: string[];
    files: string[];
    services: string[];
  };
  observation: string;
  rootCause: string;
  evidence: string[];
  recommendation: string;
  confidence: number;
  scope: 'local' | 'global';
  category: 'architecture' | 'execution' | 'agent' | 'dependency' | 'deployment' | 'testing' | 'security' | 'performance' | 'recovery' | 'gener
al';
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  expiresAt: string | null;
  appliedMissions: string[];
  validationResults: Array<{ missionId: string; outcome: 'confirmed' | 'refuted' | 'inconclusive'; timestamp: string }>;
  source: string;
}

export interface AgentLearningProfile {
  agentName: string;
  strengths: string[];
  weaknesses: string[];
  preferredDomains: string[];
  successRate: number;
  totalTasks: number;
  successfulTasks: number;
  correctionRate: number;
  confidenceTrend: number[];
  reviewOutcomes: Array<{ missionId: string; taskId: string; outcome: string; notes: string }>;
  recommendedFor: string[];
  notRecommendedFor: string[];
  updatedAt: string;
}

export interface LearningPipelineInput {
  missionGraph?: {
    objective: { title: string; description: string };
    epics: Array<{ title: string; tasks: any[] }>;
    tasks: Array<{ title: string; assignedAgent: string | null }>;
  };
  executionSummary?: {
    totalCommands: number;
    successful: number;
    failed: number;
    errors: string[];
    recommendations: string[];
  };
  timeline?: Array<{ type: string; message: string; severity: string }>;
  recoveryEvents?: Array<{ type: string; success: boolean }>;
  testResults?: Array<{ name: string; passed: boolean }>;
  agentDecisions?: Array<{ agent: string; title: string; description: string }>;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  evidence: Array<{ recordId: string; summary: string }>;
  confidence: number;
  applicableTo: string[];
  risk: 'low' | 'medium' | 'high';
  category: string;
  createdAt: string;
}
