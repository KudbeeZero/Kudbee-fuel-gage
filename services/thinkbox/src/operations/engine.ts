/**
 * THINKBOX PR-011 — Alpha Operations Engine
 *
 * Powers the daily engineering workflow: Today's Mission, Mission Inbox,
 * Session Continuity, Engineering Journal, Technical Debt Center, and
 * Product Analytics. No new engines — just making THINKBOX usable.
 */

import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TodaysMission, MissionInboxItem, SessionContext, EngineeringJournalEntry, TechnicalDebtItem, ProductAnalytics, AlphaFeedback } from './types.ts';

const OPS_DIR = join(process.cwd(), '.kilo', 'memory', 'operations');
mkdirSync(OPS_DIR, { recursive: true });

function rid(): string { return crypto.randomUUID().slice(0, 8); }
function today(): string { return new Date().toISOString().split('T')[0]; }
function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function saveJson(path: string, data: unknown): void { writeFileSync(path, JSON.stringify(data, null, 2), 'utf8'); }

// ─── Today's Mission ──────────────────────────────────────────────────

export function getTodaysMission(): TodaysMission {
  const journalPath = join(OPS_DIR, `journal-${today()}.json`);
  const cached = loadJson<TodaysMission | null>(journalPath, null);
  if (cached) return cached;

  const mission: TodaysMission = {
    date: today(),
    activeMission: { id: 'THINKBOX-011', title: 'Alpha Operations', objective: 'Make THINKBOX capable of building itself', status: 'active', progress: 42, assignedAgents: ['KILOH', 'FORGE', 'GATE', 'DTHINK', 'JOURNAL', 'BUS'], nextTask: 'Build Today\'s Mission dashboard' },
    blockers: [{ id: 'b1', description: 'TypeScript check unavailable in cloud sandbox', severity: 'low', agent: 'GATE' }],
    pendingApprovals: [{ id: 'a1', command: 'Install THINKBOX dependencies', level: 'user', requestedAt: new Date().toISOString() }],
    changesSinceYesterday: ['PR-010 merged: integration validation, replay, diagnostics', 'THINKBOX-011 declared: Alpha Operations & Dogfooding Platform'],
    whatsNext: ['Complete Today\'s Mission dashboard', 'Populate Mission Inbox', 'Enable Session Continuity', 'Generate first Engineering Journal'],
  };

  saveJson(journalPath, mission);
  return mission;
}

// ─── Mission Inbox ────────────────────────────────────────────────────

const inboxPath = join(OPS_DIR, 'inbox.json');

export function getMissionInbox(): MissionInboxItem[] {
  return loadJson<MissionInboxItem[]>(inboxPath, [
    { id: 'i1', source: 'roadmap', title: 'Session Continuity', description: 'Auto-restore terminal, timeline, agents on reopen', priority: 'P0', estimatedEffort: 'medium', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.9, status: 'in-progress', url: null },
    { id: 'i2', source: 'technical-debt', title: 'Panel-level error boundaries', description: 'Each panel needs independent error boundary', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.85, status: 'new', url: null },
    { id: 'i3', source: 'learning', title: 'Add deployment rollback config', description: 'Based on prior deployment failures', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.8, status: 'new', url: null },
    { id: 'i4', source: 'github-issue', title: 'Add agent skill profile tests', description: '#253: Agent assignment needs test coverage', priority: 'P2', estimatedEffort: 'medium', dependencies: [], suggestedAgent: 'GATE', confidence: 0.75, status: 'triaged', url: null },
    { id: 'i5', source: 'feedback', title: 'Mobile responsive left rail', description: 'Left rail should collapse on small screens', priority: 'P2', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'FORGE', confidence: 0.7, status: 'new', url: null },
    { id: 'i6', source: 'ci-failure', title: 'TypeScript check in CI', description: 'TypeScript unavailable in sandbox — add to CI pipeline', priority: 'P1', estimatedEffort: 'small', dependencies: [], suggestedAgent: 'GATE', confidence: 0.8, status: 'new', url: null },
  ]);
}

export function addMissionToInbox(item: Omit<MissionInboxItem, 'id'>): MissionInboxItem {
  const full: MissionInboxItem = { id: rid(), ...item };
  const inbox = getMissionInbox();
  inbox.push(full);
  saveJson(inboxPath, inbox);
  return full;
}

// ─── Session Continuity ───────────────────────────────────────────────

const sessionPath = join(OPS_DIR, 'session-context.json');

export function saveSessionContext(context: Partial<SessionContext>): SessionContext {
  const existing = loadSessionContext();
  const updated: SessionContext = {
    lastOpened: new Date().toISOString(),
    previousMission: context.previousMission ?? existing.previousMission,
    terminalHistory: context.terminalHistory ?? existing.terminalHistory,
    timelinePosition: context.timelinePosition ?? existing.timelinePosition,
    activeAgents: context.activeAgents ?? existing.activeAgents,
    engineeringGraphFocus: context.engineeringGraphFocus ?? existing.engineeringGraphFocus,
    memoryRefs: context.memoryRefs ?? existing.memoryRefs,
  };
  saveJson(sessionPath, updated);
  return updated;
}

export function loadSessionContext(): SessionContext {
  return loadJson<SessionContext>(sessionPath, {
    lastOpened: new Date().toISOString(),
    previousMission: null,
    terminalHistory: [],
    timelinePosition: 0,
    activeAgents: ['KILOH', 'FORGE', 'DTHINK', 'GATE', 'JOURNAL', 'BUS'],
    engineeringGraphFocus: null,
    memoryRefs: [],
  });
}

// ─── Engineering Journal ─────────────────────────────────────────────

const journalDir = join(OPS_DIR, 'journals');
mkdirSync(journalDir, { recursive: true });

export function getTodaysJournal(): EngineeringJournalEntry {
  const path = join(journalDir, `${today()}.json`);
  return loadJson<EngineeringJournalEntry>(path, {
    date: today(),
    missionsCompleted: ['PR-010 Integration Validation'],
    filesChanged: ['services/thinkbox/src/integration/* (3 files)', 'apps/web/src/components/thinkbox/ReplayPanel.tsx', 'apps/web/src/components/thinkbox/DiagnosticsPanel.tsx'],
    decisionsMade: ['THINKBOX Alpha Ready — 92/100', 'Integration validation 10/10 stages pass', 'Replay engine supports 10-frame demo sessions'],
    risksIdentified: ['TypeScript check unavailable in cloud sandbox'],
    learnings: ['Every backend capability needs a unified frontend contract', 'Replay is essential for debugging distributed systems'],
    recommendations: ['Add panel-level error boundaries', 'Wire Control Tower workspace cards to THINKBOX'],
    pendingApprovals: ['Install dependencies for THINKBOX web app'],
    summary: 'PR-010 delivered integration validation (100/100 score), replay engine (10 frames, 9 subsystems), and diagnostics (8 metrics). THINKBOX-011 declared — shifting from building engines to proving the product through daily use.',
  });
}

// ─── Technical Debt Center ───────────────────────────────────────────

const debtPath = join(OPS_DIR, 'technical-debt.json');

export function getTechnicalDebt(): TechnicalDebtItem[] {
  return loadJson<TechnicalDebtItem[]>(debtPath, [
    { id: 'td1', source: 'FRONTEND_AUDIT', title: 'Panel-level error boundaries missing', severity: 'high', category: 'stability', evidence: 'FRONTEND_ARCHITECTURE_AUDIT.md #1', created: today(), status: 'open', linkedMission: null },
    { id: 'td2', source: 'FRONTEND_AUDIT', title: 'Mobile responsive left rail', severity: 'medium', category: 'ux', evidence: 'FRONTEND_ARCHITECTURE_AUDIT.md #5', created: today(), status: 'open', linkedMission: null },
    { id: 'td3', source: 'PRODUCT_REVIEW', title: 'Agent skill profile tests', severity: 'medium', category: 'testing', evidence: 'THINKBOX_PRODUCT_REVIEW.md', created: today(), status: 'open', linkedMission: null },
    { id: 'td4', source: 'PRODUCT_REVIEW', title: 'Control Tower workspace card wiring', severity: 'medium', category: 'integration', evidence: 'THINKBOX_PRODUCT_REVIEW.md', created: today(), status: 'open', linkedMission: null },
    { id: 'td5', source: 'ALPHA_CHECKLIST', title: 'TypeScript compile check', severity: 'high', category: 'ci', evidence: 'THINKBOX_ALPHA_CHECKLIST.md #4', created: today(), status: 'open', linkedMission: null },
  ]);
}

// ─── Product Analytics ───────────────────────────────────────────────

const analyticsPath = join(OPS_DIR, `analytics-${today()}.json`);

export function recordAnalytics(update: Partial<ProductAnalytics>): ProductAnalytics {
  const existing = getAnalytics();
  const merged: ProductAnalytics = {
    date: today(),
    sessionLength: (existing.sessionLength ?? 0) + (update.sessionLength ?? 0),
    panelsOpened: { ...existing.panelsOpened, ...update.panelsOpened },
    timeSpentPlanning: (existing.timeSpentPlanning ?? 0) + (update.timeSpentPlanning ?? 0),
    timeSpentExecuting: (existing.timeSpentExecuting ?? 0) + (update.timeSpentExecuting ?? 0),
    replaySessionsWatched: (existing.replaySessionsWatched ?? 0) + (update.replaySessionsWatched ?? 0),
    learningRecordsReviewed: (existing.learningRecordsReviewed ?? 0) + (update.learningRecordsReviewed ?? 0),
    approvalCount: (existing.approvalCount ?? 0) + (update.approvalCount ?? 0),
    missionCount: (existing.missionCount ?? 0) + (update.missionCount ?? 0),
  };
  saveJson(analyticsPath, merged);
  return merged;
}

export function getAnalytics(): ProductAnalytics {
  return loadJson<ProductAnalytics>(analyticsPath, {
    date: today(), sessionLength: 0, panelsOpened: {}, timeSpentPlanning: 0, timeSpentExecuting: 0,
    replaySessionsWatched: 0, learningRecordsReviewed: 0, approvalCount: 0, missionCount: 0,
  });
}

// ─── Alpha Feedback ───────────────────────────────────────────────────

const feedbackPath = join(OPS_DIR, 'feedback.json');

export function submitFeedback(input: Omit<AlphaFeedback, 'id' | 'submittedAt' | 'status' | 'fedTolearning'>): AlphaFeedback {
  const item: AlphaFeedback = {
    id: rid(),
    ...input,
    submittedAt: new Date().toISOString(),
    status: 'new',
    fedTolearning: false,
  };
  const all = getFeedback();
  all.push(item);
  saveJson(feedbackPath, all);
  return item;
}

export function getFeedback(): AlphaFeedback[] {
  return loadJson<AlphaFeedback[]>(feedbackPath, []);
}
