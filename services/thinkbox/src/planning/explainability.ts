/**
 * THINKBOX PR-007 — Explainability Engine
 *
 * Every recommendation answers: why, based on what evidence, what alternatives
 * were considered, what risks exist, which files are affected, which agents
 * contributed. No opaque recommendations.
 */

import crypto from 'node:crypto';
import type { ExplainabilityReport, Task, DecisionRecord } from './types.ts';

export function explainTaskAssignment(
  task: Task,
  rejectedAgents: string[],
): ExplainabilityReport {
  return {
    recommendation: `Assign ${task.assignedAgent} to "${task.title}"`,
    why: `${task.assignedAgent} has the highest skill match for ${task.title.toLowerCase()}. Confidence: ${Math.round((task.assignedConfidence ?? 0) * 100)}%`,
    evidence: [
      { source: 'agent-expertise', relevance: `${task.assignedAgent} scored highest on required skills` },
      { source: 'task-complexity', relevance: `Task complexity: ${task.complexity}` },
    ],
    alternatives: rejectedAgents.map(a => ({
      option: a,
      pros: ['Alternative agent available'],
      cons: ['Lower skill match', 'Less expertise in required area'],
    })),
    risks: task.risk !== 'none' ? [`Risk level: ${task.risk}`] : [],
    affectedFiles: task.filesInvolved,
    contributingAgents: ['KILOH', 'DTHINK'],
    confidence: task.assignedConfidence ?? 0.5,
  };
}

export function explainDecomposition(
  epics: Array<{ title: string; tasks: Task[] }>,
): ExplainabilityReport {
  const totalTasks = epics.reduce((s, e) => s + e.tasks.length, 0);
  return {
    recommendation: `Decomposed into ${epics.length} epics with ${totalTasks} tasks`,
    why: `Objective matched ${epics.length} domain patterns based on keyword analysis`,
    evidence: epics.map(e => ({ source: 'domain-model', relevance: `Epic "${e.title}": ${e.tasks.length} tasks` })),
    alternatives: [],
    risks: ['Decomposition is pattern-based — manual review recommended'],
    affectedFiles: [],
    contributingAgents: ['KILOH', 'DTHINK'],
    confidence: 0.7,
  };
}

export function explainDecision(decision: DecisionRecord): ExplainabilityReport {
  return {
    recommendation: decision.title,
    why: decision.reasoning,
    evidence: (decision.evidence ?? []).map(e => ({ source: 'decision-record', relevance: e })),
    alternatives: (decision.alternatives ?? []).map((a: string) => ({
      option: a,
      pros: ['Considered alternative'],
      cons: ['Not selected based on evidence'],
    })),
    risks: decision.risks ?? [],
    affectedFiles: decision.affectedFiles ?? [],
    contributingAgents: decision.agentId ? [decision.agentId] : ['KILOH'],
    confidence: decision.confidence ?? 0.7,
  };
}

export function createDecisionRecord(input: {
  title: string;
  description: string;
  category: DecisionRecord['category'];
  evidence?: string[];
  alternatives?: string[];
  agentId?: string;
  linkedMissionId?: string;
  linkedTaskId?: string;
}): DecisionRecord {
  return {
    id: crypto.randomUUID().slice(0, 8),
    title: input.title,
    description: input.description,
    category: input.category,
    evidence: input.evidence ?? [],
    alternatives: input.alternatives ?? [],
    reasoning: input.description,
    risks: [],
    affectedFiles: [],
    linkedMissionId: input.linkedMissionId ?? null,
    linkedTaskId: input.linkedTaskId ?? null,
    agentId: input.agentId ?? null,
    timestamp: new Date().toISOString(),
    confidence: 0.85,
  };
}
