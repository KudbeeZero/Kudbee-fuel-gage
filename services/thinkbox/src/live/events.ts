/**
 * THINKBOX PR-004 — Live Event Bus
 *
 * THINKBOX-specific event types and publisher. Bridges to the existing
 * serial-bus.mjs infrastructure. Every subsystem publishes structured
 * events; the browser subscribes via SSE (/api/events).
 *
 * No polling. Everything push-based.
 */

import crypto from 'node:crypto';
import { writeFileSync, mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type ThinkboxEventType =
  | 'workspace:detected'
  | 'workspace:intel-ready'
  | 'workspace:plan-ready'
  | 'workspace:provision-started'
  | 'workspace:provision-phase'
  | 'workspace:provision-complete'
  | 'workspace:ready'
  | 'workspace:error'
  | 'agent:assigned'
  | 'agent:progress'
  | 'agent:completed'
  | 'agent:error'
  | 'terminal:command'
  | 'terminal:output'
  | 'terminal:log'
  | 'browser:connected'
  | 'browser:disconnected'
  | 'browser:error'
  | 'browser:action'
  | 'healing:detected'
  | 'healing:recovery'
  | 'healing:outcome'
  | 'timeline:recorded';

export interface ThinkboxEvent {
  id: string;
  type: ThinkboxEventType;
  workspaceId: string | null;
  agentId: string | null;
  timestamp: string;
  data: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'success';
  replayable: boolean;
}

const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory');
const THINKBOX_EVENTS_DIR = join(MEMORY_DIR, 'thinkbox-events');
const THINKBOX_TIMELINE = join(THINKBOX_EVENTS_DIR, 'timeline.jsonl');

function ensureDir(): void {
  mkdirSync(THINKBOX_EVENTS_DIR, { recursive: true });
}

function now(): string {
  return new Date().toISOString();
}

const inMemoryListeners = new Map<string, Set<(event: ThinkboxEvent) => void>>();

export function subscribeToEvents(
  workspaceId: string,
  handler: (event: ThinkboxEvent) => void,
): () => void {
  if (!inMemoryListeners.has(workspaceId)) {
    inMemoryListeners.set(workspaceId, new Set());
  }
  inMemoryListeners.get(workspaceId)!.add(handler);
  return () => {
    inMemoryListeners.get(workspaceId)?.delete(handler);
  };
}

function dispatchToListeners(event: ThinkboxEvent): void {
  const wsListeners = inMemoryListeners.get(event.workspaceId ?? '');
  if (wsListeners) {
    for (const h of wsListeners) {
      try { h(event); } catch {}
    }
  }
  const globalListeners = inMemoryListeners.get('*');
  if (globalListeners) {
    for (const h of globalListeners) {
      try { h(event); } catch {}
    }
  }
}

export function publishThinkboxEvent(input: {
  type: ThinkboxEventType;
  workspaceId: string | null;
  agentId?: string;
  data?: Record<string, unknown>;
  severity?: ThinkboxEvent['severity'];
  replayable?: boolean;
}): ThinkboxEvent {
  ensureDir();

  const event: ThinkboxEvent = {
    id: crypto.randomUUID().slice(0, 8),
    type: input.type,
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    timestamp: now(),
    data: input.data ?? {},
    severity: input.severity ?? 'info',
    replayable: input.replayable ?? true,
  };

  if (event.replayable) {
    appendFileSync(THINKBOX_TIMELINE, JSON.stringify(event) + '\n', 'utf8');
  }

  try {
    const serialBusEvent = JSON.stringify({
      type: `thinkbox:${input.type}`,
      data: event,
      ts: event.timestamp,
    });
    const busDir = join(MEMORY_DIR, 'bus');
    mkdirSync(busDir, { recursive: true });
    writeFileSync(join(busDir, `${event.id}.json`), serialBusEvent, 'utf8');

    const indexFile = join(busDir, 'index.json');
    let index: unknown[] = [];
    if (existsSync(indexFile)) {
      try { index = JSON.parse(readFileSync(indexFile, 'utf8')); } catch {}
    }
    index.push({ id: event.id, type: input.type, ts: event.timestamp });
    if (index.length > 500) index = index.slice(-500);
    writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
  } catch {}

  dispatchToListeners(event);
  return event;
}

export function replayTimeline(workspaceId?: string, limit = 50): ThinkboxEvent[] {
  ensureDir();
  if (!existsSync(THINKBOX_TIMELINE)) return [];

  const lines = readFileSync(THINKBOX_TIMELINE, 'utf8').trim().split('\n');
  const events: ThinkboxEvent[] = [];

  for (const line of lines) {
    try {
      const event: ThinkboxEvent = JSON.parse(line);
      if (workspaceId && event.workspaceId !== workspaceId) continue;
      events.push(event);
    } catch {}
  }

  return events.slice(-limit);
}

export function filterTimeline(
  filters: {
    workspaceId?: string;
    agentId?: string;
    type?: ThinkboxEventType;
    severity?: ThinkboxEvent['severity'];
    since?: string;
  },
  limit = 50,
): ThinkboxEvent[] {
  let events = replayTimeline(filters.workspaceId, 1000);

  if (filters.agentId) events = events.filter(e => e.agentId === filters.agentId);
  if (filters.type) events = events.filter(e => e.type === filters.type);
  if (filters.severity) events = events.filter(e => e.severity === filters.severity);
  if (filters.since) events = events.filter(e => e.timestamp >= filters.since);

  return events.slice(-limit);
}

export function getEventStats(): {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  latestEvent: ThinkboxEvent | null;
} {
  const events = replayTimeline(undefined, 500);
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
  }

  return {
    total: events.length,
    byType,
    bySeverity,
    latestEvent: events.length > 0 ? events[events.length - 1] : null,
  };
}
