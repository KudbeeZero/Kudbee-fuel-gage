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

const BATCH_INTERVAL_MS = 1000;
const MAX_BATCH_SIZE = 50;

let _queue: TelemetryEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;

function flush() {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;

  const batch = _queue.splice(0, MAX_BATCH_SIZE);

  apiPost<{ success: boolean; persisted: number; filtered: number }>('/api/telemetry/ingest/batch', { events: batch }).catch(() => {}).finally(() => {
    _flushing = false;
    if (_queue.length > 0) scheduleFlush();
  });
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, BATCH_INTERVAL_MS);
}

export function enqueueTelemetry(event: TelemetryEvent): void {
  _queue.push(event);
  if (_queue.length >= MAX_BATCH_SIZE) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    flush();
  } else {
    scheduleFlush();
  }
}

export function getQueueLength(): number {
  return _queue.length;
}
