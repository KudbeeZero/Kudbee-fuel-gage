import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryVault } from '../src/memoryVault';
import type { AgentMemoryChunk, MemoryStorageEvent } from '@kudbee/types';

describe('Memory telemetry events', () => {
  let vault: MemoryVault;
  let events: MemoryStorageEvent[];

  beforeEach(() => {
    vault = new MemoryVault({ maxChunks: 50 });
    events = [];
    vault.onEvent((e) => events.push(e));
  });

  it('should emit memory.stored event on store', () => {
    vault.store({
      agentId: 'telemetry-agent',
      content: 'Test telemetry event emission.',
      category: 'FACT',
      importance: 0.8,
      embedding: [],
      metadata: {},
      ttlMs: 60_000
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const storedEvent = events[0];
    expect(storedEvent).toBeDefined();
    expect(storedEvent!.type).toBe('memory.stored');
    expect(storedEvent!.agentId).toBe('telemetry-agent');
    expect(storedEvent!.category).toBe('FACT');
  });

  it('should emit memory.recalled event on recall', () => {
    vault.store({
      agentId: 'recall-agent',
      content: 'Recall test content for telemetry.',
      category: 'OBSERVATION',
      importance: 0.7,
      embedding: [],
      metadata: {},
      ttlMs: 60_000
    });

    vault.recall({
      query: 'Recall test',
      limit: 5,
      minSimilarity: 0.1,
      categoryFilter: []
    });

    const recalledEvents = events.filter((e) => e.type === 'memory.recalled');
    expect(recalledEvents.length).toBeGreaterThanOrEqual(1);
    expect(recalledEvents[0]!.category).toBe('OBSERVATION');
  });

  it('should emit memory.evicted event when capacity exceeded', () => {
    const smallVault = new MemoryVault({ maxChunks: 2 });
    const evictedEvents: MemoryStorageEvent[] = [];
    smallVault.onEvent((e) => {
      if (e.type === 'memory.evicted') evictedEvents.push(e);
    });

    smallVault.store({
      agentId: 'evict-1', content: 'first', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });
    smallVault.store({
      agentId: 'evict-2', content: 'second', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });
    smallVault.store({
      agentId: 'evict-3', content: 'third', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    expect(evictedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should include correct context window size in events', () => {
    vault.store({
      agentId: 'size-test', content: 'Size check.', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    const storedEvent = events.find((e) => e.type === 'memory.stored');
    expect(storedEvent).toBeDefined();
    expect(storedEvent!.contextWindowSize).toBeGreaterThanOrEqual(1);
  });

  it('should emit events for diverse categories', () => {
    const categories = ['FACT', 'OBSERVATION', 'DECISION', 'ERROR', 'TOOL_CALL'] as const;

    for (const cat of categories) {
      vault.store({
        agentId: 'diverse', content: `${cat} memory`, category: cat,
        importance: 0.6, embedding: [], metadata: {}, ttlMs: 60_000
      });

      const lastEvent = events[events.length - 1];
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.category).toBe(cat);
    }

    expect(events.length).toBeGreaterThanOrEqual(5);
  });
});
