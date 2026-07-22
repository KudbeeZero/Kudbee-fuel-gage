import { useEffect } from 'react';
import { useTerminalStore } from '../store/terminalStore';

const TASK_EVENT_TYPES = [
  'task.queued',
  'task.processing',
  'task.success',
  'task.failed',
  'task.dead_lettered',
  'task.retry_queued',
  'task.discarded'
];

function describe(type: string, data: any): string {
  const id = data?.id || '?';
  const kind = data?.kind || 'TASK';
  const attempt = data?.attempts || data?.attempt;
  switch (type) {
    case 'task.queued':
      return `[${kind}:${id}] QUEUED`;
    case 'task.processing':
      return `[${kind}:${id}] PROCESSING (attempt ${attempt || 1})`;
    case 'task.success':
      return `[${kind}:${id}] SUCCESS (attempt ${attempt || 1})`;
    case 'task.failed':
      return `[${kind}:${id}] FAILED · ${data?.error || 'unknown'}`;
    case 'task.dead_lettered':
      return `[${kind}:${id}] DEAD_LETTERED after ${attempt || 3} attempts · ${data?.error || ''}`;
    case 'task.retry_queued':
      return `[${kind}:${id}] RETRY_QUEUED`;
    case 'task.discarded':
      return `[${kind}:${id}] DISCARDED`;
    default:
      return `[${kind}:${id}] ${type}`;
  }
}

function severity(type: string): 'info' | 'warning' | 'error' {
  if (type === 'task.success' || type === 'task.queued' || type === 'task.retry_queued') return 'info';
  if (type === 'task.dead_lettered' || type === 'task.discarded') return 'error';
  return 'warning';
}

export function useLiveTaskStream() {
  const push = useTerminalStore((s) => s.pushExternalLog);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      for (const eventType of TASK_EVENT_TYPES) {
        es.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            push({
              id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: severity(eventType),
              label: eventType.replace('task.', '').toUpperCase(),
              message: describe(eventType, data),
              time: new Date().toLocaleTimeString()
            });
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* SSE unavailable */
    }
    return () => {
      if (es) es.close();
    };
  }, [push]);
}
