import { describe, it, expect } from 'bun:test';
import { MemoryVault } from '../src/memoryVault';

describe('MemoryVault stress test', () => {
  it('should handle 100 rapid stores without error', () => {
    const vault = new MemoryVault({ maxChunks: 200 });

    for (let i = 0; i < 100; i++) {
      vault.store({
        agentId: `stress-agent-${i % 5}`,
        content: `Stress test memory chunk number ${i}. This content is unique.`,
        category: i % 3 === 0 ? 'FACT' : i % 3 === 1 ? 'OBSERVATION' : 'DECISION',
        importance: 0.5 + (i % 50) / 100,
        embedding: [(i % 10) / 10, ((i + 1) % 10) / 10, ((i + 2) % 10) / 10],
        metadata: { index: i },
        ttlMs: 60_000
      });
    }

    expect(vault.size).toBe(100);
  });

  it('should correctly recall from 100 seeded memories', () => {
    const vault = new MemoryVault({ maxChunks: 200 });

    vault.store({
      agentId: 'needle', content: 'NEEDLE: This is the specific memory to find in a haystack of 100 items.',
      category: 'FACT', importance: 0.95, embedding: [0.5, 0.5, 0.5], metadata: {}, ttlMs: 60_000
    });

    for (let i = 0; i < 99; i++) {
      vault.store({
        agentId: 'hay', content: 'HAY: random filler memory content for stress testing.',
        category: 'OBSERVATION', importance: 0.1 + Math.random() * 0.3, embedding: [], metadata: {}, ttlMs: 60_000
      });
    }

    const results = vault.recall({
      query: 'NEEDLE specific haystack',
      limit: 5,
      minSimilarity: 0.2,
      categoryFilter: []
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.content).toContain('NEEDLE');
  });

  it('should not crash on empty recall', () => {
    const vault = new MemoryVault({ maxChunks: 200 });

    const results = vault.recall({
      query: 'nothing stored yet',
      limit: 10,
      minSimilarity: 0.1,
      categoryFilter: []
    });

    expect(results.length).toBe(0);
  });

  it('should maintain correct size after multiple operations', () => {
    const vault = new MemoryVault({ maxChunks: 200 });

    for (let i = 0; i < 50; i++) vault.store({
      agentId: 'size-ops', content: `chunk-${i}`, category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000
    });

    expect(vault.size).toBe(50);

    vault.recall({ query: 'chunk-25', limit: 5, minSimilarity: 0.1, categoryFilter: [] });
    vault.recall({ query: 'chunk-10', limit: 5, minSimilarity: 0.1, categoryFilter: [] });

    expect(vault.size).toBe(50);

    vault.store({ agentId: 'extra', content: 'one more', category: 'FACT',
      importance: 0.5, embedding: [], metadata: {}, ttlMs: 60_000 });
    expect(vault.size).toBe(51);
  });
});
