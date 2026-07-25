import type {
  AgentMemoryChunk,
  MemoryStorageEvent,
  MemoryRetrievalQuery
} from '@kudbee/types';

let _idCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

interface MemoryVaultOptions {
  maxChunks?: number;
  defaultTTLMs?: number;
}

export class MemoryVault {
  private chunks: Map<string, AgentMemoryChunk>;
  private maxChunks: number;
  private defaultTTLMs: number;
  private eventListeners: Array<(event: MemoryStorageEvent) => void>;

  constructor(options: MemoryVaultOptions = {}) {
    this.chunks = new Map();
    this.maxChunks = options.maxChunks ?? 500;
    this.defaultTTLMs = options.defaultTTLMs ?? 7 * 86400_000;
    this.eventListeners = [];
  }

  onEvent(cb: (event: MemoryStorageEvent) => void): () => void {
    this.eventListeners.push(cb);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== cb);
    };
  }

  private emit(event: MemoryStorageEvent): void {
    for (const cb of this.eventListeners) {
      try { cb(event); } catch { /* ignore */ }
    }
  }

  store(chunk: Omit<AgentMemoryChunk, 'id' | 'storedAt'>): AgentMemoryChunk {
    const record: AgentMemoryChunk = {
      ...chunk,
      id: nextId('mem'),
      storedAt: new Date().toISOString()
    };

    this.chunks.set(record.id, record);

    if (this.chunks.size > this.maxChunks) {
      const oldest = this.getOldestChunk();
      if (oldest) {
        this.chunks.delete(oldest.id);
        this.emit({
          type: 'memory.evicted',
          chunkId: oldest.id,
          agentId: oldest.agentId,
          category: oldest.category,
          importance: oldest.importance,
          contextWindowSize: this.chunks.size,
          timestamp: new Date().toISOString()
        });
      }
    }

    this.emit({
      type: 'memory.stored',
      chunkId: record.id,
      agentId: record.agentId,
      category: record.category,
      importance: record.importance,
      contextWindowSize: this.chunks.size,
      timestamp: record.storedAt
    });

    return record;
  }

  recall(
    query: MemoryRetrievalQuery
  ): AgentMemoryChunk[] {
    const queryTerms = query.query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: Array<{ chunk: AgentMemoryChunk; score: number }> = [];

    for (const chunk of this.chunks.values()) {
      if (Date.now() - new Date(chunk.storedAt).getTime() > chunk.ttlMs) {
        this.chunks.delete(chunk.id);
        continue;
      }

      if (
        query.categoryFilter.length > 0 &&
        !query.categoryFilter.includes(chunk.category)
      ) {
        continue;
      }

      const contentLower = chunk.content.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          score += 1;
        }
      }

      if (chunk.embedding.length > 0 && queryTerms.length > 0) {
        score += chunk.importance * 2;
      }

      if (score >= query.minSimilarity) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, query.limit);

    if (results.length > 0) {
      const firstResult = results[0]!;
      this.emit({
        type: 'memory.recalled',
        chunkId: firstResult.chunk.id,
        agentId: firstResult.chunk.agentId,
        category: firstResult.chunk.category,
        importance: firstResult.chunk.importance,
        contextWindowSize: this.chunks.size,
        timestamp: new Date().toISOString()
      });
    }

    return results.map((r) => r.chunk);
  }

  getContextWindow(maxTokens?: number): string {
    const chunks = Array.from(this.chunks.values())
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime())
      .slice(0, 10);

    const contextParts = chunks.map((chunk) => {
      return `[${chunk.category}:${chunk.agentId}] ${chunk.content} (importance: ${chunk.importance.toFixed(1)})`;
    });

    let context = contextParts.join('\n');
    if (maxTokens && context.length > maxTokens * 4) {
      context = context.slice(0, maxTokens * 4 - 100) + '... [truncated]';
    }

    return context;
  }

  private getOldestChunk(): AgentMemoryChunk | undefined {
    let oldest: AgentMemoryChunk | undefined;
    let oldestTime = Infinity;

    for (const chunk of this.chunks.values()) {
      const storedTime = new Date(chunk.storedAt).getTime();
      if (storedTime < oldestTime) {
        oldestTime = storedTime;
        oldest = chunk;
      }
    }

    return oldest;
  }

  get size(): number {
    return this.chunks.size;
  }

  get(count: number): AgentMemoryChunk[] {
    return Array.from(this.chunks.values())
      .sort((a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime())
      .slice(0, count);
  }

  getById(id: string): AgentMemoryChunk | undefined {
    return this.chunks.get(id);
  }

  clear(): void {
    this.chunks.clear();
  }
}
