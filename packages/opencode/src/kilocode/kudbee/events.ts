export type EngineEventType = 'SAFE_ZONE_UPDATE' | 'TRAJECTORY_UPDATE' | 'INTERCEPT';

export interface EngineEvent {
  type: EngineEventType;
  payload: unknown;
  timestamp?: string;
}

type Listener = (evt: EngineEvent) => void;

export class EngineBus {
  private channels = new Map<EngineEventType, Set<Listener>>();

  subscribe(type: EngineEventType, fn: Listener): () => void {
    let set = this.channels.get(type);
    if (!set) {
      set = new Set<Listener>();
      this.channels.set(type, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }

  emit(type: EngineEventType, payload: unknown): void {
    const set = this.channels.get(type);
    const evt: EngineEvent = { type, payload, timestamp: new Date().toISOString() };
    if (set) {
      for (const fn of set) {
        try {
          fn(evt);
        } catch {
          /* break the chain */
        }
      }
    }
  }

  reset(): void {
    this.channels.clear();
  }
}
