/**
 * THINKBOX PR-009 — Learning Pipeline
 *
 * Takes mission output (graph, execution, timeline, recoveries, tests,
 * decisions) and produces structured Engineering Learning Records.
 */

import crypto from 'node:crypto';
import type { LearningRecord, LearningPipelineInput } from './types.ts';
import { storeLearningRecord, getLearningRecords } from './records.ts';

function rid(): string { return crypto.randomUUID().slice(0, 8); }
function now(): string { return new Date().toISOString(); }

export function extractLearning(input: LearningPipelineInput): LearningRecord[] {
  const records: LearningRecord[] = [];
  const wsId = 'current';

  // Pattern 1: Deployment failures → deployment recommendation
  const deployFailures = input.timeline?.filter(e => e.type?.includes('deploy') && e.severity === 'error') ?? [];
  if (deployFailures.length > 0 || input.recoveryEvents?.some(e => !e.success)) {
    records.push({
      id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: [], files: [], services: [] },
      observation: `Deployment encountered ${deployFailures.length} failures`,
      rootCause: 'Deployment configuration may need hardening',
      evidence: deployFailures.map(e => e.message),
      recommendation: 'Verify deployment rollback configuration before next deploy',
      confidence: deployFailures.length > 2 ? 0.8 : 0.6,
      scope: 'local', category: 'deployment', severity: 'high',
      createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
      source: 'pipeline:execution',
    });
  }

  // Pattern 2: Test failures → testing recommendation
  if (input.testResults?.some(t => !t.passed)) {
    const failed = input.testResults.filter(t => !t.passed);
    records.push({
      id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: [], files: [], services: [] },
      observation: `${failed.length}/${input.testResults.length} tests failed`,
      rootCause: `${failed.map(t => t.name).join(', ')} may have regressions`,
      evidence: failed.map(t => `Test: ${t.name}`),
      recommendation: 'Add regression test coverage for failing areas and run before merge',
      confidence: 0.75,
      scope: 'local', category: 'testing', severity: 'high',
      createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
      source: 'pipeline:tests',
    });
  }

  // Pattern 3: Agent decisions → agent learning
  if (input.agentDecisions && input.agentDecisions.length > 0) {
    for (const decision of input.agentDecisions) {
      records.push({
        id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: [decision.agent], files: [], services: [] },
        observation: `${decision.agent}: ${decision.title}`,
        rootCause: 'Agent decision during mission execution',
        evidence: [decision.description],
        recommendation: `Consider automating "${decision.title}" if pattern repeats`,
        confidence: 0.65,
        scope: 'local', category: 'agent', severity: 'medium',
        createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
        source: 'pipeline:agent-decision',
      });
    }
  }

  // Pattern 4: Execution errors → general recovery learning
  const execErrors = input.executionSummary?.errors ?? [];
  if (execErrors.length > 0) {
    records.push({
      id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: [], files: [], services: [] },
      observation: `${execErrors.length} execution errors occurred`,
      rootCause: 'Execution environment or command issues',
      evidence: execErrors.slice(0, 3),
      recommendation: 'Review execution queue for commands that need pre-checks',
      confidence: 0.7,
      scope: 'local', category: 'execution', severity: 'medium',
      createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
      source: 'pipeline:execution-summary',
    });
  }

  // Pattern 5: Successful recovery → reusable recovery pattern
  const successfulRecoveries = input.recoveryEvents?.filter(e => e.success) ?? [];
  if (successfulRecoveries.length > 0) {
    records.push({
      id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: [], files: [], services: [] },
      observation: `${successfulRecoveries.length} successful recoveries`,
      rootCause: 'Recovery procedures are effective',
      evidence: ['Recovery events documented in timeline'],
      recommendation: 'Formalize recovery patterns into runbook',
      confidence: 0.85,
      scope: 'global', category: 'recovery', severity: 'medium',
      createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
      source: 'pipeline:recovery',
    });
  }

  // Pattern 6: Agent task load from mission graph
  if (input.missionGraph?.tasks) {
    const agentLoads = new Map<string, number>();
    for (const t of input.missionGraph.tasks) {
      if (t.assignedAgent) {
        agentLoads.set(t.assignedAgent, (agentLoads.get(t.assignedAgent) ?? 0) + 1);
      }
    }
    const overloaded = [...agentLoads.entries()].filter(([, v]) => v > 3);
    if (overloaded.length > 0) {
      records.push({
        id: rid(), context: { missionId: null, workspaceId: wsId, epics: [], agents: overloaded.map(([k]) => k), files: [], services: [] },
        observation: `${overloaded.map(([k, v]) => `${k}(${v})`).join(', ')} loaded with many tasks`,
        rootCause: 'Task decomposition may create imbalance',
        evidence: overloaded.map(([k, v]) => `${k}: ${v} tasks`),
        recommendation: 'Balance task distribution across agents or increase concurrency limits',
        confidence: 0.7,
        scope: 'global', category: 'agent', severity: 'low',
        createdAt: now(), expiresAt: null, appliedMissions: [], validationResults: [],
        source: 'pipeline:mission-graph',
      });
    }
  }

  for (const r of records) storeLearningRecord(r);
  return records;
}

export function getLearningFeedback(objective: { title: string; description: string }): {
  records: LearningRecord[];
  recommendations: string[];
} {
  const allRecords = getLearningRecords();
  const lower = `${objective.title} ${objective.description}`.toLowerCase();

  const relevant = allRecords.filter(r => {
    for (const cat of [r.category, ...(r.evidence ?? [])]) {
      if (lower.includes(cat.toLowerCase())) return true;
    }
    return false;
  });

  return {
    records: relevant.slice(0, 10),
    recommendations: relevant.map(r => r.recommendation).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5),
  };
}
