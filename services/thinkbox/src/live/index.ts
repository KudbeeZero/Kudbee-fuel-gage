/**
 * THINKBOX PR-004 — Live Orchestration Index
 *
 * Barrel export for the live workspace orchestration layer.
 */

export { publishThinkboxEvent, subscribeToEvents, replayTimeline, filterTimeline, getEventStats } from './events.ts';
export type { ThinkboxEvent, ThinkboxEventType } from './events.ts';

export { detectFailure, attemptRecovery, reportRecovery, getActiveIncidents, getRecoveryStats } from './healing.ts';
export type { HealingIncident } from './healing.ts';

export { createSession, saveSession, loadSession, updateAgent, appendTerminalLine, completeSession, listSessions } from './session.ts';
export type { WorkspaceSession } from './session.ts';
