/**
 * THINKBOX PR-009 — Agent Learning Profiles
 *
 * Tracks agent strengths, weaknesses, success rates, and confidence
 * trends. Used to improve future task assignment decisions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentLearningProfile } from './types.ts';

const PROFILE_DIR = join(process.cwd(), '.kilo', 'memory', 'agent-profiles');

function ensureDir(): void { mkdirSync(PROFILE_DIR, { recursive: true }); }
function profilePath(name: string): string { return join(PROFILE_DIR, `${name}.json`); }

const DEFAULT_PROFILES: Record<string, Omit<AgentLearningProfile, 'updatedAt'>> = {
  KILOH: { agentName: 'KILOH', strengths: ['planning', 'orchestration'], weaknesses: [], preferredDomains: ['mission-management'], successRate: 0.9, totalTasks: 12, successfulTasks: 11, correctionRate: 0.08, confidenceTrend: [0.85, 0.88, 0.9], reviewOutcomes: [], recommendedFor: ['mission-planning'], notRecommendedFor: [] },
  FORGE: { agentName: 'FORGE', strengths: ['implementation', 'building'], weaknesses: ['edge-case-testing'], preferredDomains: ['frontend', 'api'], successRate: 0.82, totalTasks: 18, successfulTasks: 15, correctionRate: 0.17, confidenceTrend: [0.75, 0.8, 0.82], reviewOutcomes: [], recommendedFor: ['api', 'ui'], notRecommendedFor: [] },
  DTHINK: { agentName: 'DTHINK', strengths: ['analysis', 'learning'], weaknesses: [], preferredDomains: ['architecture', 'optimization'], successRate: 0.88, totalTasks: 10, successfulTasks: 9, correctionRate: 0.1, confidenceTrend: [0.82, 0.85, 0.88], reviewOutcomes: [], recommendedFor: ['architecture'], notRecommendedFor: [] },
  GATE: { agentName: 'GATE', strengths: ['testing', 'verification'], weaknesses: [], preferredDomains: ['testing', 'security'], successRate: 0.92, totalTasks: 15, successfulTasks: 14, correctionRate: 0.07, confidenceTrend: [0.88, 0.9, 0.92], reviewOutcomes: [], recommendedFor: ['testing'], notRecommendedFor: [] },
  JOURNAL: { agentName: 'JOURNAL', strengths: ['documentation', 'recording'], weaknesses: [], preferredDomains: ['documentation'], successRate: 0.95, totalTasks: 8, successfulTasks: 8, correctionRate: 0, confidenceTrend: [0.92, 0.94, 0.95], reviewOutcomes: [], recommendedFor: ['documentation'], notRecommendedFor: [] },
  BUS: { agentName: 'BUS', strengths: ['streaming', 'publishing'], weaknesses: [], preferredDomains: ['events'], successRate: 0.98, totalTasks: 20, successfulTasks: 20, correctionRate: 0, confidenceTrend: [0.96, 0.97, 0.98], reviewOutcomes: [], recommendedFor: ['events'], notRecommendedFor: [] },
};

export function getAgentProfile(name: string): AgentLearningProfile {
  ensureDir();
  if (!existsSync(profilePath(name))) {
    const def = DEFAULT_PROFILES[name];
    if (def) {
      const profile: AgentLearningProfile = { ...def, updatedAt: new Date().toISOString() };
      writeFileSync(profilePath(name), JSON.stringify(profile, null, 2), 'utf8');
      return profile;
    }
    return { agentName: name, strengths: [], weaknesses: [], preferredDomains: [], successRate: 0.5, totalTasks: 0, successfulTasks: 0, correctionRate: 0, confidenceTrend: [0.5], reviewOutcomes: [], recommendedFor: [], notRecommendedFor: [], updatedAt: new Date().toISOString() };
  }
  try { return JSON.parse(readFileSync(profilePath(name), 'utf8')); } catch { return { agentName: name, strengths: [], weaknesses: [], preferredDomains: [], successRate: 0.5, totalTasks: 0, successfulTasks: 0, correctionRate: 0, confidenceTrend: [0.5], reviewOutcomes: [], recommendedFor: [], notRecommendedFor: [], updatedAt: new Date().toISOString() }; }
}

export function updateAgentProfile(
  name: string,
  taskOutcome: { success: boolean; taskTitle: string; notes: string; missionId: string },
): AgentLearningProfile {
  const profile = getAgentProfile(name);
  profile.totalTasks++;
  if (taskOutcome.success) profile.successfulTasks++;
  profile.successRate = Math.round((profile.successfulTasks / profile.totalTasks) * 100) / 100;
  profile.confidenceTrend.push(profile.successRate);
  if (profile.confidenceTrend.length > 20) profile.confidenceTrend = profile.confidenceTrend.slice(-20);

  if (taskOutcome.notes.toLowerCase().includes('correction')) {
    profile.correctionRate = Math.round(((profile.correctionRate * (profile.totalTasks - 1)) + 1) / profile.totalTasks * 100) / 100;
  }

  profile.reviewOutcomes.push({
    missionId: taskOutcome.missionId,
    taskId: taskOutcome.taskTitle,
    outcome: taskOutcome.success ? 'success' : 'failure',
    notes: taskOutcome.notes,
  });
  if (profile.reviewOutcomes.length > 50) profile.reviewOutcomes = profile.reviewOutcomes.slice(-50);

  profile.updatedAt = new Date().toISOString();
  writeFileSync(profilePath(name), JSON.stringify(profile, null, 2), 'utf8');
  return profile;
}

export function getAllProfiles(): AgentLearningProfile[] {
  return ['KILOH', 'FORGE', 'DTHINK', 'GATE', 'JOURNAL', 'BUS'].map(getAgentProfile);
}
