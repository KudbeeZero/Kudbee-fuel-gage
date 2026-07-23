import { apiPost } from './apiClient';

interface TelemetryEvent {
  trace_id: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  status?: string;
  provider?: string;
  project_name?: string;
}

export type BatcherListener = (state: BatcherState) => void;

export interface BatcherState {
  queueLength: number;
  flushing: boolean;
  batchPending: boolean;
}

const BATCH_INTERVAL_MS = 1000;
const MAX_BATCH_SIZE = 50;

let _queue: TelemetryEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;
let _listeners: BatcherListener[] = [];

function notify() {
  const state: BatcherState = {
    queueLength: _queue.length,
    flushing: _flushing,
    batchPending: _queue.length > 0 && !_flushing
  };
  for (const fn of _listeners) {
    try { fn(state); } catch { /* swallow listener errors */ }
  }
}

function flush() {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;
  notify();

  const batch = _queue.splice(0, MAX_BATCH_SIZE);

  apiPost<{ success: boolean; persisted: number; filtered: number }>('/api/telemetry/ingest/batch', { events: batch }).catch((err) => {
    console.warn('[TelemetryBatcher] batch send failed:', err instanceof Error ? err.message : String(err));
  }).finally(() => {
    _flushing = false;
    notify();
    if (_queue.length > 0) scheduleFlush();
  });
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, BATCH_INTERVAL_MS);
  notify();
}

export function enqueueTelemetry(event: TelemetryEvent): void {
  _queue.push(event);
  if (_queue.length >= MAX_BATCH_SIZE) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    flush();
  } else {
    scheduleFlush();
  }
  notify();
}

export function getQueueLength(): number {
  return _queue.length;
}

export function isBatching(): boolean {
  return _queue.length > 0 && _flushTimer !== null;
}

export function subscribeBatcher(fn: BatcherListener): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

export function getBatcherState(): BatcherState {
  return {
    queueLength: _queue.length,
    flushing: _flushing,
    batchPending: _queue.length > 0 && !_flushing
  };
}
