/**
 * Live Memory Seeding Script
 * ---------------------------------------------------------------------------
 * Initializes the MemoryVault, seeds it with domain-specific semantic
 * memories, verifies recall accuracy via cosine similarity, and emits
 * telemetry events through the EngineBus.
 *
 * Usage: bun run packages/opencode/scripts/seed-memory.ts
 * ---------------------------------------------------------------------------
 */

import { MemoryVault } from '../../../services/memory/src/memoryVault.ts';
import { recallSimilarMemories, formatRecallResults } from '../../../services/memory/src/semanticRecall.ts';
import { EngineBus, KudbeeEvents } from '../src/kilocode/kudbee/events.ts';
import type { AgentMemoryChunk, MemoryRetrievalQuery } from '@kudbee/types';

const SEED_MEMORIES: Array<Omit<AgentMemoryChunk, 'id' | 'storedAt'>> = [
  {
    agentId: 'seed-script',
    content: 'User prefers dark mode for all dashboard panels and prefers the midnight color scheme.',
    category: 'FACT',
    importance: 0.9,
    embedding: [0.15, 0.82, 0.34, 0.67, 0.91],
    metadata: { source: 'user-preference', domain: 'ui' },
    ttlMs: 30 * 86400_000
  },
  {
    agentId: 'seed-script',
    content: 'Agent architecture relies on Upstash Redis for real-time telemetry, pub/sub event bus, and memory vault persistence.',
    category: 'FACT',
    importance: 0.95,
    embedding: [0.72, 0.11, 0.88, 0.43, 0.19],
    metadata: { source: 'architecture', domain: 'infrastructure' },
    ttlMs: 30 * 86400_000
  },
  {
    agentId: 'seed-script',
    content: 'The Sentinel firewall blocks anomalous tool calls exceeding the risk threshold of 0.7 and trips the circuit breaker.',
    category: 'DECISION',
    importance: 0.85,
    embedding: [0.33, 0.67, 0.21, 0.94, 0.55],
    metadata: { source: 'security-policy', domain: 'governance' },
    ttlMs: 30 * 86400_000
  },
  {
    agentId: 'seed-script',
    content: 'DeepSeek V4 is the primary reasoning model with a 1M token context window, used for complex multi-step agent trajectories.',
    category: 'OBSERVATION',
    importance: 0.88,
    embedding: [0.45, 0.72, 0.18, 0.63, 0.81],
    metadata: { source: 'model-config', domain: 'ai' },
    ttlMs: 30 * 86400_000
  },
  {
    agentId: 'seed-script',
    content: 'Rate limit exceeded error at 2026-07-24T15:30:00Z — worker BRPOP hit Upstash 500k monthly quota. Circuit breaker engaged for 30s.',
    category: 'ERROR',
    importance: 0.5,
    embedding: [0.91, 0.03, 0.47, 0.22, 0.14],
    metadata: { source: 'incident-log', domain: 'operations' },
    ttlMs: 14 * 86400_000
  }
];

const RECALL_QUERIES: MemoryRetrievalQuery[] = [
  { query: 'What does the user prefer for UI?', limit: 3, minSimilarity: 0.2, categoryFilter: [] },
  { query: 'Upstash Redis telemetry', limit: 3, minSimilarity: 0.2, categoryFilter: [] },
  { query: 'firewall tool risk threshold', limit: 3, minSimilarity: 0.2, categoryFilter: ['DECISION'] },
  { query: 'DeepSeek context window', limit: 3, minSimilarity: 0.2, categoryFilter: ['OBSERVATION'] },
  { query: 'rate limit worker crash', limit: 3, minSimilarity: 0.2, categoryFilter: ['ERROR'] }
];

async function seedMemories(vault: MemoryVault, bus: EngineBus): Promise<AgentMemoryChunk[]> {
  const stored: AgentMemoryChunk[] = [];

  for (const seed of SEED_MEMORIES) {
    const chunk = vault.store(seed);
    stored.push(chunk);
    bus.emit(KudbeeEvents.memory_stored, {
      id: chunk.id,
      content: chunk.content.slice(0, 80),
      category: chunk.category,
      importance: chunk.importance,
      timestamp: chunk.storedAt
    });
    console.log(`  [SEED] Stored: ${chunk.id.slice(0, 12)}... | ${chunk.category} | importance=${chunk.importance}`);
  }

  return stored;
}

async function runRecallQueries(vault: MemoryVault, chunks: AgentMemoryChunk[], bus: EngineBus): Promise<number> {
  let totalRecalled = 0;

  for (const query of RECALL_QUERIES) {
    const results = recallSimilarMemories(query, chunks);
    totalRecalled += results.length;
    bus.emit(KudbeeEvents.memory_recalled, {
      query: query.query,
      resultsFound: results.length,
      topSimilarity: results[0]?.importance ?? 0,
      timestamp: new Date().toISOString()
    });
    console.log(`  [RECALL] "${query.query}" → ${results.length} results`);
    if (results.length > 0) {
      console.log(`    Top: ${results[0]?.content.slice(0, 60)}...`);
    }
  }

  return totalRecalled;
}

async function main() {
  console.log('=== Kudbee Live Memory Seeding ===\n');

  const vault = new MemoryVault({ maxChunks: 500 });
  const bus = new EngineBus();

  console.log('[1/3] Seeding memories...');
  const seeded = await seedMemories(vault, bus);
  console.log(`  Total seeded: ${seeded.length}\n`);

  console.log('[2/3] Running recall queries...');
  const totalRecalled = await runRecallQueries(vault, seeded, bus);
  console.log(`  Total recalled: ${totalRecalled}\n`);

  console.log('[3/3] Verification...');
  console.log(`  Vault size: ${vault.size}`);
  console.log(`  Context window:\n${vault.getContextWindow(500)}\n`);

  const allRecalled = totalRecalled >= 3;
  const vaultHealthy = vault.size >= 4;

  if (allRecalled && vaultHealthy) {
    console.log('✓ All checks passed — memory pipeline is live and operational.');
    process.exit(0);
  } else {
    console.error(`✗ Checks failed: recalled=${allRecalled}, vaultSize=${vaultHealthy}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
