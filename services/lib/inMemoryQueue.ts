interface QueueItem {
  id: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

const MAX_QUEUE_SIZE = 10_000;
const MAX_RETRIES = 3;
const FLUSH_INTERVAL_MS = 5_000;

export interface InMemoryQueueOptions {
  maxSize?: number;
  flushIntervalMs?: number;
  onFlush?: (items: QueueItem[]) => Promise<void>;
}

export class InMemoryQueueManager {
  private queue: QueueItem[];
  private maxSize: number;
  private flushIntervalMs: number;
  private onFlush: ((items: QueueItem[]) => Promise<void>) | null;
  private flushTimer: ReturnType<typeof setInterval> | null;
  private flushing: boolean;
  private active: boolean;

  constructor(options: InMemoryQueueOptions = {}) {
    this.queue = [];
    this.maxSize = options.maxSize ?? MAX_QUEUE_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.onFlush = options.onFlush ?? null;
    this.flushTimer = null;
    this.flushing = false;
    this.active = false;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    console.log('[InMemoryQueue] Started flush timer');
  }

  stop(): void {
    this.active = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
    console.log('[InMemoryQueue] Stopped');
  }

  enqueue(data: unknown): string {
    const id = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: QueueItem = {
      id,
      data,
      timestamp: Date.now(),
      retries: 0
    };

    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }

    this.queue.push(item);
    return id;
  }

  async flush(): Promise<number> {
    if (this.flushing || this.queue.length === 0) return 0;
    this.flushing = true;

    const batch = [...this.queue];
    this.queue = [];

    try {
      if (this.onFlush) {
        await this.onFlush(batch);
      }
      return batch.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[InMemoryQueue] Flush failed: ${message}`);

      for (const item of batch) {
        item.retries += 1;
        if (item.retries < MAX_RETRIES) {
          this.queue.unshift(item);
        } else {
          console.warn(`[InMemoryQueue] Dropping item ${item.id} after ${MAX_RETRIES} failed retries`);
        }
      }

      return 0;
    } finally {
      this.flushing = false;
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get isActive(): boolean {
    return this.active;
  }

  stats(): { size: number; active: boolean; oldestItemAgeMs: number | null } {
    const oldest = this.queue[0];
    return {
      size: this.queue.length,
      active: this.active,
      oldestItemAgeMs: oldest ? Date.now() - oldest.timestamp : null
    };
  }
}

let _instance: InMemoryQueueManager | null = null;

export function getOrCreateInMemoryQueue(
  options?: InMemoryQueueOptions
): InMemoryQueueManager {
  if (!_instance) {
    _instance = new InMemoryQueueManager(options);
    _instance.start();
  }
  return _instance;
}

export function isInMemoryFallbackActive(): boolean {
  return _instance?.isActive ?? false;
}
