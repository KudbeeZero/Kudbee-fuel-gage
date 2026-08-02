/**
 * THINKBOX PR-004 — Workspace Session Manager
 *
 * Every THINKBOX session gets an ID, mission, workspace, agents, timeline,
 * terminal history, and memory snapshot. Everything resumable.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { publishThinkboxEvent } from './events.ts';
import { replayTimeline } from './events.ts';

export interface WorkspaceSession {
  sessionId: string;
  workspaceId: string;
  missionId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  agents: Array<{
    name: string;
    role: string;
    status: 'active' | 'idle' | 'error';
    assignedAt: string;
    lastActivity: string;
    taskCount: number;
  }>;
  timelineSnapshot: unknown[];
  terminalHistory: string[];
  memoryRefs: string[];
  notes: string;
}

const SESSIONS_DIR = join(process.cwd(), '.kilo', 'memory', 'thinkbox-sessions');

function ensureDir(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

export function createSession(
  workspaceId: string,
  missionId: string,
): WorkspaceSession {
  ensureDir();

  const session: WorkspaceSession = {
    sessionId: crypto.randomUUID().slice(0, 8),
    workspaceId,
    missionId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'active',
    agents: [
      { name: 'KILOH', role: 'Orchestrator', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
      { name: 'FORGE', role: 'Workspace Builder', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
      { name: 'DTHINK', role: 'Knowledge Synthesis', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
      { name: 'GATE', role: 'Quality Enforcement', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
      { name: 'JOURNAL', role: 'Engineering Memory', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
      { name: 'BUS', role: 'Event Bus', status: 'active', assignedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), taskCount: 0 },
    ],
    timelineSnapshot: [],
    terminalHistory: [],
    memoryRefs: [],
    notes: '',
  };

  saveSession(session);

  publishThinkboxEvent({
    type: 'workspace:ready',
    workspaceId,
    agentId: 'KILOH',
    data: { sessionId: session.sessionId },
    severity: 'success',
  });

  return session;
}

export function saveSession(session: WorkspaceSession): void {
  ensureDir();
  session.timelineSnapshot = replayTimeline(session.workspaceId, 100);
  writeFileSync(sessionPath(session.sessionId), JSON.stringify(session, null, 2), 'utf8');
}

export function loadSession(sessionId: string): WorkspaceSession | null {
  const p = sessionPath(sessionId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function updateAgent(
  session: WorkspaceSession,
  agentName: string,
  update: Partial<{ status: 'active' | 'idle' | 'error'; lastActivity: string; taskCount: number }>,
): void {
  const agent = session.agents.find(a => a.name === agentName);
  if (!agent) return;
  Object.assign(agent, update);
  agent.lastActivity = new Date().toISOString();

  publishThinkboxEvent({
    type: update.status === 'error' ? 'agent:error' : 'agent:progress',
    workspaceId: session.workspaceId,
    agentId: agentName,
    data: { status: agent.status, taskCount: agent.taskCount },
    severity: update.status === 'error' ? 'error' : 'info',
  });

  saveSession(session);
}

export function appendTerminalLine(session: WorkspaceSession, line: string): void {
  session.terminalHistory.push(`[${new Date().toISOString()}] ${line}`);
  if (session.terminalHistory.length > 1000) {
    session.terminalHistory = session.terminalHistory.slice(-1000);
  }

  publishThinkboxEvent({
    type: 'terminal:log',
    workspaceId: session.workspaceId,
    data: { line },
    severity: 'info',
  });

  saveSession(session);
}

export function completeSession(session: WorkspaceSession): WorkspaceSession {
  session.status = 'completed';
  session.endedAt = new Date().toISOString();
  session.timelineSnapshot = replayTimeline(session.workspaceId, 200);

  publishThinkboxEvent({
    type: 'workspace:ready',
    workspaceId: session.workspaceId,
    agentId: 'KILOH',
    data: { sessionComplete: true, duration: Date.now() - new Date(session.startedAt).getTime() },
    severity: 'success',
  });

  saveSession(session);
  return session;
}

export function listSessions(workspaceId?: string): WorkspaceSession[] {
  ensureDir();
  const { readdirSync } = require('node:fs');
  const sessions: WorkspaceSession[] = [];
  try {
    for (const f of readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith('.json')) continue;
      const s = loadSession(f.replace('.json', ''));
      if (s && (!workspaceId || s.workspaceId === workspaceId)) {
        sessions.push(s);
      }
    }
  } catch {}
  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
