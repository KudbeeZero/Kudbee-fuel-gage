/**
 * THINKBOX PR-007 — Mission Planner
 *
 * Takes a user objective + workspace intelligence → produces a complete
 * MissionGraph with epics, tasks, dependencies, risks, agent assignments,
 * and execution order. Nothing executes — planning only.
 */

import crypto from 'node:crypto';
import type { MissionGraph, MissionObjective, Epic, Task } from './types.ts';
import { decomposeObjective } from './decomposition.ts';
import { assignAgents } from './assignment.ts';

function mid(): string { return crypto.randomUUID().slice(0, 8); }

export function createMissionGraph(
  objective: { title: string; description: string; priority?: 'P0' | 'P1' | 'P2' | 'P3' },
  workspaceIntel?: { languages: string[]; frameworks: string[]; services: any[]; dependencies: any[]; confidence: number },
): MissionGraph {
  const mObj: MissionObjective = {
    id: mid(),
    title: objective.title,
    description: objective.description,
    status: 'draft',
    priority: objective.priority ?? 'P0',
    complexity: 'moderate',
    estimatedDurationMs: 0,
    confidence: workspaceIntel?.confidence ?? 0.5,
  };

  const { epics, tasks } = decomposeObjective(mObj, workspaceIntel);
  const assignedTasks = assignAgents(tasks, workspaceIntel);

  const dependencies: MissionGraph['dependencies'] = [];
  const taskMap = new Map(assignedTasks.map(t => [t.id, t]));

  for (const task of assignedTasks) {
    for (const depId of task.dependsOn) {
      if (taskMap.has(depId)) {
        dependencies.push({ from: depId, to: task.id, type: 'depends_on' });
      }
    }
  }

  for (let i = 1; i < assignedTasks.length; i++) {
    if (!assignedTasks[i].dependsOn.includes(assignedTasks[i - 1].id)) {
      dependencies.push({ from: assignedTasks[i - 1].id, to: assignedTasks[i].id, type: 'enables' });
    }
  }

  const risks: MissionGraph['risks'] = [];
  const highRiskTasks = assignedTasks.filter(t => t.risk === 'high' || t.risk === 'critical');
  for (const t of highRiskTasks) {
    risks.push({
      id: `risk-${mid()}`,
      description: `Task "${t.title}" has ${t.risk} risk`,
      severity: t.risk === 'critical' ? 'high' : t.risk === 'high' ? 'high' : 'medium',
      mitigation: `Assign experienced agent, verify with tests, implement rollback`,
      linkedTaskIds: [t.id],
    });
  }

  if (!workspaceIntel?.dependencies?.some((d: any) => d.lockfilePresent)) {
    risks.push({
      id: `risk-${mid()}`,
      description: 'Missing lockfiles — dependency versions may drift',
      severity: 'medium',
      mitigation: 'Add lockfile before dependency-modifying tasks',
      linkedTaskIds: assignedTasks.filter(t => t.title.toLowerCase().includes('install') || t.title.toLowerCase().includes('dep')).map(t => t.id),
    });
  }

  const agentSet = new Map<string, { name: string; reason: string; confidence: number }>();
  for (const t of assignedTasks) {
    if (t.assignedAgent && !agentSet.has(t.assignedAgent)) {
      agentSet.set(t.assignedAgent, { name: t.assignedAgent, reason: `Assigned to ${t.title}`, confidence: t.assignedConfidence });
    }
  }

  const totalMs = assignedTasks.reduce((sum, t) => sum + t.estimatedDurationMs, 0);

  return {
    missionId: mObj.id,
    objective: mObj,
    epics,
    tasks: assignedTasks,
    dependencies,
    risks,
    estimatedTotalDurationMs: totalMs,
    requiredAgents: [...agentSet.values()],
    suggestedExecutionOrder: assignedTasks.map(t => t.id),
    completionCriteria: [
      'All tasks completed',
      'All tests pass',
      'All decisions recorded',
      'Engineering memory updated',
      'Mission memory archived',
    ],
    generatedAt: new Date().toISOString(),
    confidence: assignedTasks.reduce((s, t) => s + t.confidence, 0) / Math.max(1, assignedTasks.length),
  };
}
