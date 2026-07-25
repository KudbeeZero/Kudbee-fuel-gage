import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryVault } from '../src/memoryVault';
import { recallSimilarMemories, formatRecallResults, computeCosineSimilarity } from '../src/semanticRecall';
import type { AgentMemoryChunk, MemoryRetrievalQuery } from '@kudbee/types';

describe('MemoryVault', () => {
  let vault: MemoryVault;

  beforeEach(() => {
    vault = new MemoryVault({ maxChunks: 50, defaultTTLMs: 60_000 });
  });

  it('should store a memory chunk and return it with an id', () => {
    const chunk = vault.store({
      agentId: 'agent-1',
      content: 'The user prefers dark mode for all dashboards.',
      category: 'FACT',
      importance: 0.8,
      embedding: [0.1, 0.2, 0.3],
      metadata: { source: 'user-preference' },
      ttlMs: 86_400_000
    });

    expect(chunk.id).toBeDefined();
    expect(chunk.storedAt).toBeDefined();
    expect(chunk.content).toBe('The user prefers dark mode for all dashboards.');
  });

  it('should recall memories by keyword match', () => {
    vault.store({
      agentId: 'agent-1',
      content: 'Dark mode is enabled.',
      category: 'FACT',
      importance: 0.9,
      embedding: [],
      metadata: {},
      ttlMs: 86_400_000
    });

    const query: MemoryRetrievalQuery = {
      query: 'dark mode',
      limit: 5,
      minSimilarity: 0.1,
      categoryFilter: []
    };

    const results = vault.recall(query);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.content).toContain('Dark mode');
  });

  it('should filter recalls by category', () => {
    vault.store({
      agentId: 'agent-1',
      content: 'Error: database connection failed',
      category: 'ERROR',
      importance: 0.3,
      embedding: [],
      metadata: {},
      ttlMs: 86_400_000
    });

    vault.store({
      agentId: 'agent-2',
      content: 'Added telemetry dashboard widget',
      category: 'OBSERVATION',
      importance: 0.7,
      embedding: [],
      metadata: {},
      ttlMs: 86_400_000
    });

    const query: MemoryRetrievalQuery = {
      query: 'error',
      limit: 5,
      minSimilarity: 0.1,
      categoryFilter: ['ERROR']
    };

    const results = vault.recall(query);
    expect(results.every((r) => r.category === 'ERROR')).toBe(true);
  });

  it('should evict oldest chunk when exceeding max capacity', () => {
    const smallVault = new MemoryVault({ maxChunks: 2 });

    smallVault.store({
      agentId: 'a', content: 'first', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    smallVault.store({
      agentId: 'b', content: 'second', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    smallVault.store({
      agentId: 'c', content: 'third', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    expect(smallVault.size).toBeLessThanOrEqual(2);
  });

  it('should emit storage events', () => {
    const events: string[] = [];
    vault.onEvent((e) => events.push(e.type));

    vault.store({
      agentId: 'agent-1', content: 'test event', category: 'DECISION',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    expect(events).toContain('memory.stored');
  });

  it('should build a context window string', () => {
    vault.store({
      agentId: 'agent-cw', content: 'Context item 1', category: 'FACT',
      importance: 0.8, embedding: [], metadata: {}, ttlMs: 60_000
    });

    vault.store({
      agentId: 'agent-cw', content: 'Context item 2', category: 'OBSERVATION',
      importance: 0.6, embedding: [], metadata: {}, ttlMs: 60_000
    });

    const context = vault.getContextWindow();
    expect(context).toContain('Context item 1');
    expect(context).toContain('Context item 2');
    expect(context).toContain('FACT');
    expect(context).toContain('OBSERVATION');
  });

  it('should expire TTL-expired chunks on recall', () => {
    const expireVault = new MemoryVault({ maxChunks: 10, defaultTTLMs: 50 });

    expireVault.store({
      agentId: 'expire-test', content: 'ephemeral', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 50
    });

    setTimeout(() => {
      const results = expireVault.recall({
        query: 'ephemeral', limit: 5, minSimilarity: 0, categoryFilter: []
      });
      expect(results.length).toBe(0);
    }, 100);
  });
});

describe('semanticRecall', () => {
  const chunks: AgentMemoryChunk[] = [
    {
      id: '1', agentId: 'a', content: 'Prefer Python for data processing.',
      category: 'FACT', importance: 0.9, embedding: [0.5, 0.8, 0.2],
      metadata: {}, storedAt: new Date().toISOString(), ttlMs: 86_400_000
    },
    {
      id: '2', agentId: 'a', content: 'React dashboard uses dark mode.',
      category: 'OBSERVATION', importance: 0.7, embedding: [0.3, 0.1, 0.9],
      metadata: {}, storedAt: new Date().toISOString(), ttlMs: 86_400_000
    },
    {
      id: '3', agentId: 'b', content: 'Database query timed out at 15:30.',
      category: 'ERROR', importance: 0.4, embedding: [0.9, 0.2, 0.1],
      metadata: {}, storedAt: new Date().toISOString(), ttlMs: 86_400_000
    }
  ];

  it('should recall by keyword matching', () => {
    const results = recallSimilarMemories(
      { query: 'Python data', limit: 3, minSimilarity: 0.1, categoryFilter: [] },
      chunks
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes('Python'))).toBe(true);
  });

  it('should recall by category filter', () => {
    const results = recallSimilarMemories(
      { query: 'timeout', limit: 3, minSimilarity: 0.1, categoryFilter: ['ERROR'] },
      chunks
    );
    expect(results.every((r) => r.category === 'ERROR')).toBe(true);
  });

  it('should return empty for no matches', () => {
    const results = recallSimilarMemories(
      { query: 'quantum computing', limit: 3, minSimilarity: 0.5, categoryFilter: [] },
      chunks
    );
    expect(results.length).toBe(0);
  });

  it('should compute cosine similarity', () => {
    const sim = computeCosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(sim).toBeCloseTo(1.0, 1);

    const orth = computeCosineSimilarity([1, 0], [0, 1]);
    expect(orth).toBeCloseTo(0, 1);
  });

  it('should format recall results', () => {
    const formatted = formatRecallResults(chunks.slice(0, 2), 500);
    expect(formatted).toContain('Python');
    expect(formatted).toContain('dark mode');
    expect(formatted).toContain('---');
  });
});
