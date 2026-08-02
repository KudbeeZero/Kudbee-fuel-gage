/**
 * THINKBOX PR-010 — Engineering Replay Engine
 *
 * Reconstructs an entire engineering session: timeline, terminal output,
 * agent decisions, planning, execution, and learning. Supports deterministic
 * replay for audit, debugging, and demonstration.
 */

import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ReplayFrame {
  id: string;
  timestamp: string;
  subsystem: 'detection' | 'intelligence' | 'planning' | 'provision' | 'execution' | 'agent' | 'terminal' | 'learning' | 'recommendation';
  action: string;
  detail: string;
  output: unknown;
  agentId: string | null;
}

export interface ReplaySession {
  sessionId: string;
  workspaceId: string;
  startedAt: string;
  durationMs: number;
  frames: ReplayFrame[];
  metadata: { totalFrames: number; subsystems: string[]; agentContributions: Record<string, number> };
}

const REPLAY_DIR = join(process.cwd(), '.kilo', 'memory', 'replays');
mkdirSync(REPLAY_DIR, { recursive: true });

function fid(): string { return crypto.randomUUID().slice(0, 8); }
function now(): string { return new Date().toISOString(); }

export function createReplaySession(workspaceId: string): ReplaySession {
  return {
    sessionId: fid(),
    workspaceId,
    startedAt: now(),
    durationMs: 0,
    frames: [],
    metadata: { totalFrames: 0, subsystems: [], agentContributions: {} },
  };
}

export function recordFrame(session: ReplaySession, frame: Omit<ReplayFrame, 'id' | 'timestamp'>): ReplaySession {
  const f: ReplayFrame = { id: fid(), timestamp: now(), ...frame };
  session.frames.push(f);
  session.metadata.totalFrames = session.frames.length;
  session.metadata.subsystems = [...new Set(session.frames.map(f => f.subsystem))];
  if (frame.agentId) {
    session.metadata.agentContributions[frame.agentId] = (session.metadata.agentContributions[frame.agentId] ?? 0) + 1;
  }
  return session;
}

export function saveReplaySession(session: ReplaySession): string {
  const path = join(REPLAY_DIR, `${session.sessionId}.json`);
  session.durationMs = session.frames.length > 0
    ? new Date(session.frames[session.frames.length - 1].timestamp).getTime() - new Date(session.frames[0].timestamp).getTime()
    : 0;
  writeFileSync(path, JSON.stringify(session, null, 2), 'utf8');
  return path;
}

export function loadReplaySession(sessionId: string): ReplaySession | null {
  const path = join(REPLAY_DIR, `${sessionId}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function listReplaySessions(): Array<{ id: string; workspaceId: string; frames: number; date: string }> {
  try {
    const { readdirSync } = require('node:fs');
    return readdirSync(REPLAY_DIR)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => {
        const s = loadReplaySession(f.replace('.json', ''));
        return s ? { id: s.sessionId, workspaceId: s.workspaceId, frames: s.metadata.totalFrames, date: s.startedAt } : null;
      })
      .filter(Boolean);
  } catch { return []; }
}

export function replaySession(session: ReplaySession, speed: number = 1): ReplaySession {
  const replayed: ReplaySession = { ...session, frames: [...session.frames] };
  const baseTime = new Date(replayed.frames[0]?.timestamp ?? now()).getTime();
  for (const f of replayed.frames) {
    const originalTime = new Date(f.timestamp).getTime();
    const offset = (originalTime - baseTime) / speed;
    f.timestamp = new Date(baseTime + offset).toISOString();
  }
  return replayed;
}

export function generateDemoSession(workspaceId: string): ReplaySession {
  const session = createReplaySession(workspaceId);
  const timeline = [
    { subsystem: 'detection' as const, action: 'Project detected', detail: '10 languages, 2 frameworks found', agentId: null as string | null },
    { subsystem: 'intelligence' as const, action: 'Intelligence generated', detail: '7 services, 55 env vars', agentId: null as string | null },
    { subsystem: 'planning' as const, action: 'Mission planned', detail: '2 epics, 10 tasks', agentId: null as string | null },
    { subsystem: 'agent' as const, action: 'Agents assigned', detail: 'FORGE, GATE, JOURNAL', agentId: 'KILOH' },
    { subsystem: 'provision' as const, action: 'Provision planned', detail: '70 steps, Score 100/A', agentId: 'FORGE' },
    { subsystem: 'execution' as const, action: 'Execution planned', detail: '70 commands, 2 approvals', agentId: 'FORGE' },
    { subsystem: 'terminal' as const, action: 'Terminal started', detail: 'Simulation mode active', agentId: 'KILOH' },
    { subsystem: 'learning' as const, action: 'Learning extracted', detail: '5 records from execution', agentId: 'DTHINK' },
    { subsystem: 'recommendation' as const, action: 'Recommendations generated', detail: '2 evidence-based recs', agentId: 'KILOH' },
    { subsystem: 'agent' as const, action: 'Mission complete', detail: 'All tasks verified', agentId: 'GATE' },
  ];

  for (const t of timeline) {
    recordFrame(session, { ...t, output: t.detail });
  }
  saveReplaySession(session);
  return session;
}
