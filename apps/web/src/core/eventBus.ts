/**
 * OS Event Bus — lightweight PubSub for inter-process communication.
 */
type Listener = (data: unknown) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => { this.listeners.get(event)?.delete(fn); };
  }

  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (set) set.forEach((fn) => { try { fn(data); } catch {} });
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }
}

export const osEventBus = new EventBus();

export const OSEvents = {
  OS_SYSTEM_ALERT: 'OS_SYSTEM_ALERT',
  PLUGIN_MOUNTED: 'PLUGIN_MOUNTED',
  PLUGIN_UNMOUNTED: 'PLUGIN_UNMOUNTED',
  RATE_LIMIT_WARNING: 'RATE_LIMIT_WARNING',
  WORKER_COMPLETE: 'WORKER_COMPLETE',
  WORKER_ERROR: 'WORKER_ERROR',
  HEALTH_CHANGE: 'HEALTH_CHANGE',
} as const;
