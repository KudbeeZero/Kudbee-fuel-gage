import crypto from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export type ThinkboxEventType = 'workspace:detected' | 'workspace:intel-ready' | 'workspace:plan-ready' | 'workspace:provision-complete' | 'agent:completed' | 'agent:error' | 'terminal:log' | 'healing:detected' | 'healing:recovery' | 'healing:outcome' | 'browser:connected' | 'browser:error' | 'browser:action';

export interface ThinkboxEvent { id: string; type: ThinkboxEventType; workspaceId: string | null; agentId: string | null; timestamp: string; data: Record<string, unknown>; severity: 'info' | 'warn' | 'error' | 'success'; replayable: boolean; }

const EVENTS_DIR = join(process.cwd(), '.kilo', 'memory', 'thinkbox-events');
const TIMELINE = join(EVENTS_DIR, 'timeline.jsonl');
mkdirSync(EVENTS_DIR, { recursive: true });

export function publishThinkboxEvent(input: { type: ThinkboxEventType; workspaceId: string | null; agentId?: string; data?: any; severity?: ThinkboxEvent['severity'] }): ThinkboxEvent {
  const e: ThinkboxEvent = { id: crypto.randomUUID().slice(0, 8), type: input.type, workspaceId: input.workspaceId, agentId: input.agentId ?? null, timestamp: new Date().toISOString(), data: input.data ?? {}, severity: input.severity ?? 'info', replayable: true };
  try { appendFileSync(TIMELINE, JSON.stringify(e) + '\n'); } catch {}
  return e;
}
