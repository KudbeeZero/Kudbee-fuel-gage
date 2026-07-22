import { useEffect, useState, useCallback } from 'react';

export interface TaskEvent {
  id?: string;
  kind?: string;
  attempt?: number;
  attempts?: number;
  error?: string;
  result?: unknown;
  at?: string;
  ts?: string;
}

export interface TaskStreamState {
  events: Array<{ type: string; data: TaskEvent; ts: string }>;
  connected: boolean;
  clear: () => void;
}

export function useTaskStream(maxEvents = 100): TaskStreamState {
  const [events, setEvents] = useState<Array<{ type: string; data: TaskEvent; ts: string }>>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const handleTask = (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(e.data) as TaskEvent;
        setEvents((prev) => {
          const next = [{ type: 'task', data, ts: new Date().toISOString() }, ...prev];
          return next.slice(0, maxEvents);
        });
      } catch {
        /* ignore */
      }
    };

    try {
      es = new EventSource('/api/events');
      es.addEventListener('task.queued', handleTask as EventListener);
      es.addEventListener('task.processing', handleTask as EventListener);
      es.addEventListener('task.success', handleTask as EventListener);
      es.addEventListener('task.failed', handleTask as EventListener);
      es.addEventListener('task.dead_lettered', handleTask as EventListener);
      es.addEventListener('task.retry_queued', handleTask as EventListener);
      es.addEventListener('task.discarded', handleTask as EventListener);
      es.addEventListener('open', () => setConnected(true));
      es.addEventListener('error', () => setConnected(false));
    } catch {
      setConnected(false);
    }

    return () => {
      cancelled = true;
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [maxEvents]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, clear };
}
