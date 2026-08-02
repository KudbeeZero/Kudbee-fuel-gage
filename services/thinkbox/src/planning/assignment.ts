/**
 * THINKBOX PR-007 — Dynamic Agent Assignment
 *
 * Evidence-based agent selection. For every task, determines required skills,
 * evaluates agent profiles against task requirements, and assigns the best
 * agent with a confidence score. Supports reassignment.
 */

import type { Task, AgentSkillProfile } from './types.ts';

const AGENT_PROFILES: AgentSkillProfile[] = [
  {
    agentName: 'KILOH', skills: ['planning', 'orchestration', 'architecture', 'mission-management', 'risk-assessment'],
    expertise: { planning: 0.95, orchestration: 0.9, architecture: 0.85, 'mission-management': 0.95, 'risk-assessment': 0.9 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 3,
  },
  {
    agentName: 'FORGE', skills: ['implementation', 'building', 'refactoring', 'installation', 'configuration', 'deployment'],
    expertise: { implementation: 0.9, building: 0.92, refactoring: 0.85, installation: 0.88, configuration: 0.85, deployment: 0.82 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 2,
  },
  {
    agentName: 'DTHINK', skills: ['analysis', 'learning', 'pattern-recognition', 'optimization', 'architecture'],
    expertise: { analysis: 0.93, learning: 0.9, 'pattern-recognition': 0.88, optimization: 0.85, architecture: 0.82 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 2,
  },
  {
    agentName: 'GATE', skills: ['testing', 'verification', 'quality', 'security', 'compliance', 'review'],
    expertise: { testing: 0.95, verification: 0.93, quality: 0.9, security: 0.85, compliance: 0.88, review: 0.9 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 3,
  },
  {
    agentName: 'JOURNAL', skills: ['documentation', 'recording', 'memory', 'reporting', 'search'],
    expertise: { documentation: 0.95, recording: 0.92, memory: 0.9, reporting: 0.88, search: 0.85 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 2,
  },
  {
    agentName: 'BUS', skills: ['event-streaming', 'publishing', 'communication', 'routing'],
    expertise: { 'event-streaming': 0.95, publishing: 0.93, communication: 0.9, routing: 0.88 },
    taskHistory: [], currentLoad: 0, maxConcurrent: 5,
  },
];

function taskSkillRequirements(task: Task): string[] {
  const skills: string[] = [];
  const lower = `${task.title} ${task.description}`.toLowerCase();

  if (lower.includes('plan') || lower.includes('mission') || lower.includes('orchestrat') || lower.includes('objective')) skills.push('planning', 'orchestration');
  if (lower.includes('implement') || lower.includes('build') || lower.includes('create') || lower.includes('install') || lower.includes('config')) skills.push('implementation', 'building');
  if (lower.includes('analytic') || lower.includes('learn') || lower.includes('pattern') || lower.includes('optimize') || lower.includes('profile')) skills.push('analysis', 'pattern-recognition');
  if (lower.includes('test') || lower.includes('verify') || lower.includes('quality') || lower.includes('security') || lower.includes('review')) skills.push('testing', 'verification');
  if (lower.includes('document') || lower.includes('record') || lower.includes('report') || lower.includes('memory')) skills.push('documentation', 'recording');
  if (skills.length === 0) skills.push('implementation');

  return [...new Set(skills)];
}

function scoreAgent(task: Task, profile: AgentSkillProfile): { agent: string; score: number; reasoning: string } {
  const required = taskSkillRequirements(task);
  if (required.length === 0) return { agent: profile.agentName, score: 0.5, reasoning: 'No specific skills matched' };

  let totalScore = 0;
  const matched: string[] = [];

  for (const skill of required) {
    const expertise = profile.expertise[skill] ?? 0;
    totalScore += expertise;
    if (expertise > 0) matched.push(skill);
  }

  const avgScore = totalScore / required.length;
  const matchRatio = matched.length / required.length;
  const score = avgScore * matchRatio;

  const loadPenalty = profile.currentLoad >= profile.maxConcurrent ? 0.5 : 1;
  const finalScore = score * loadPenalty;

  return {
    agent: profile.agentName,
    score: Math.round(finalScore * 100) / 100,
    reasoning: `Skills matched: ${matched.join(', ')} (${Math.round(matchRatio * 100)}% match). Load: ${profile.currentLoad}/${profile.maxConcurrent}`,
  };
}

export function assignAgents(
  tasks: Task[],
  workspaceIntel?: any,
): Task[] {
  const loadMap = new Map(AGENT_PROFILES.map(p => [p.agentName, 0]));

  return tasks.map(task => {
    const scores = AGENT_PROFILES.map(p => {
      const profile = { ...p, currentLoad: loadMap.get(p.agentName) ?? 0 };
      return scoreAgent(task, profile);
    });

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    if (best.score > 0.3) {
      task.assignedAgent = best.agent;
      task.assignedConfidence = best.score;
      loadMap.set(best.agent, (loadMap.get(best.agent) ?? 0) + 1);
    } else {
      task.assignedAgent = 'FORGE';
      task.assignedConfidence = 0.6;
    }

    if (task.confidence === 0) {
      task.confidence = task.assignedConfidence;
    }

    return task;
  });
}

export function reassignTask(task: Task, newAgent: string): Task {
  task.assignedAgent = newAgent;
  task.assignedConfidence = 0.7;
  return task;
}

export function getAgentProfile(name: string): AgentSkillProfile | undefined {
  return AGENT_PROFILES.find(p => p.agentName === name);
}
