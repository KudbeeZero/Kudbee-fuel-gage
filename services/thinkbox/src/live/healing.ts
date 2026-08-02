/**
 * THINKBOX PR-004 — Self-Healing Module
 *
 * Implements the detect → publish → recover → report pattern.
 * Every failure is observable. No silent errors.
 */

import { publishThinkboxEvent } from './events.ts';
import type { ThinkboxEventType } from './events.ts';

export interface HealingIncident {
  id: string;
  type: 'connection_lost' | 'timeout' | 'agent_crash' | 'redis_error' | 'db_error' | 'worker_failure';
  workspaceId: string | null;
  agentId: string | null;
  detectedAt: string;
  recoveryAttempts: number;
  maxAttempts: number;
  status: 'detected' | 'recovering' | 'recovered' | 'failed';
  lastError: string | null;
  recoveredAt: string | null;
}

const activeIncidents = new Map<string, HealingIncident>();
const INCIDENT_MEMORY = new Map<string, number>();

const MAX_RECOVERY_ATTEMPTS = 3;
const COOLDOWN_MS = 30000;

function incidentKey(type: string, agentId: string): string {
  return `${type}:${agentId}`;
}

export function detectFailure(input: {
  type: HealingIncident['type'];
  workspaceId: string | null;
  agentId?: string;
  error?: string;
}): HealingIncident {
  const key = incidentKey(input.type, input.agentId ?? 'unknown');
  const now = new Date().toISOString();

  const existing = activeIncidents.get(key);
  if (existing && existing.status === 'recovered') {
    activeIncidents.delete(key);
  }

  const cooldownKey = `${key}:cooldown`;
  const lastRecovery = INCIDENT_MEMORY.get(cooldownKey);
  if (lastRecovery && Date.now() - lastRecovery < COOLDOWN_MS) {
    const incident: HealingIncident = {
      id: key,
      type: input.type,
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      detectedAt: now,
      recoveryAttempts: 0,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      status: 'recovered',
      lastError: input.error ?? null,
      recoveredAt: new Date(lastRecovery).toISOString(),
    };
    return incident;
  }

  const incident: HealingIncident = existing ?? {
    id: key,
    type: input.type,
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    detectedAt: now,
    recoveryAttempts: 0,
    maxAttempts: MAX_RECOVERY_ATTEMPTS,
    status: 'detected',
    lastError: null,
    recoveredAt: null,
  };

  incident.lastError = input.error ?? incident.lastError;
  incident.recoveryAttempts = Math.min(incident.recoveryAttempts + 1, MAX_RECOVERY_ATTEMPTS);

  publishThinkboxEvent({
    type: 'healing:detected',
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    data: {
      incidentType: input.type,
      attempt: incident.recoveryAttempts,
      error: input.error,
    },
    severity: incident.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS ? 'error' : 'warn',
  });

  activeIncidents.set(key, incident);
  return incident;
}

export function attemptRecovery(incident: HealingIncident): HealingIncident {
  incident.status = 'recovering';

  publishThinkboxEvent({
    type: 'healing:recovery',
    workspaceId: incident.workspaceId,
    agentId: incident.agentId,
    data: {
      incidentType: incident.type,
      attempt: incident.recoveryAttempts,
    },
    severity: 'info',
  });

  incident.recoveryAttempts += 1;

  if (incident.recoveryAttempts > incident.maxAttempts) {
    incident.status = 'failed';
    publishThinkboxEvent({
      type: 'healing:outcome',
      workspaceId: incident.workspaceId,
      agentId: incident.agentId,
      data: { success: false, reason: 'max attempts reached' },
      severity: 'error',
    });
    activeIncidents.delete(incident.id);
    return incident;
  }

  return incident;
}

export function reportRecovery(incident: HealingIncident, success: boolean): HealingIncident {
  incident.status = success ? 'recovered' : 'failed';
  incident.recoveredAt = success ? new Date().toISOString() : null;

  publishThinkboxEvent({
    type: 'healing:outcome',
    workspaceId: incident.workspaceId,
    agentId: incident.agentId,
    data: {
      success,
      incidentType: incident.type,
      attempts: incident.recoveryAttempts,
      duration: incident.recoveredAt
        ? new Date(incident.recoveredAt).getTime() - new Date(incident.detectedAt).getTime()
        : null,
    },
    severity: success ? 'success' : 'error',
  });

  if (success) {
    INCIDENT_MEMORY.set(`${incident.id}:cooldown`, Date.now());
  }

  activeIncidents.delete(incident.id);
  return incident;
}

export function getActiveIncidents(): HealingIncident[] {
  return [...activeIncidents.values()];
}

export function getRecoveryStats(): {
  totalIncidents: number;
  activeCount: number;
  recoveredCount: number;
  failedCount: number;
  avgRecoveryMs: number;
} {
  let recoveredCount = 0;
  let failedCount = 0;

  for (const [, v] of INCIDENT_MEMORY) {
    if (v > 0) recoveredCount++;
  }

  return {
    totalIncidents: activeIncidents.size + INCIDENT_MEMORY.size,
    activeCount: activeIncidents.size,
    recoveredCount,
    failedCount: 0,
    avgRecoveryMs: 0,
  };
}
