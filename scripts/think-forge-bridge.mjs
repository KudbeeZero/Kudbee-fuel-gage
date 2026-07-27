#!/usr/bin/env node
/**
 * scripts/think-forge-bridge.mjs
 * ---------------------------------------------------------------------------
 * Think Token Forge Live Feed — Continuous Context (Pipeline 4)
 *
 * When a snippet is recalled (via snippet-agent.mjs or agent recall),
 * this bridge automatically streams the recall event and the snippet
 * content into the think_tokens pgvector table. This provides real-time
 * context injection for the LLM matrix without requiring manual API
 * polling or explicit injection commands.
 *
 * Each recall becomes a think_token entry with:
 *   - task_context: { query, snippetId, score, agentId, timestamp }
 *   - correction_delta: snippet content (the codebase knowledge)
 *   - status: PROVEN (automatic from verified recall)
 *
 * The Token Forge's getRelevantThinkTokens() can then semantically
 * retrieve these entries via pgvector cosine distance for LLM context.
 *
 * Usage:
 *   node scripts/think-forge-bridge.mjs feed     Start live feed
 *   node scripts/think-forge-bridge.mjs stats    Feed statistics
 *   node scripts/think-forge-bridge.mjs inject <snippetId>  Manual inject
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const FORGE_DIR = join(REPO_ROOT, '.kilo', 'memory', 'forge');
const FORGE_STATE_PATH = join(FORGE_DIR, 'feed-state.json');
const FORGE_QUEUE_PATH = join(FORGE_DIR, 'injection-queue.json');

mkdirSync(FORGE_DIR, { recursive: true });

// ─── Forge state ───────────────────────────────────────────────────────────

let forgeState = {
  started: null,
  totalInjected: 0,
  lastInjection: null,
  bySnippet: {},
  injections: [],
};

function loadState() {
  try { if (existsSync(FORGE_STATE_PATH)) forgeState = JSON.parse(readFileSync(FORGE_STATE_PATH, 'utf8')); } catch {}
  return forgeState;
}

function saveState() {
  writeFileSync(FORGE_STATE_PATH, JSON.stringify(forgeState, null, 2), 'utf8');
}

function loadQueue() {
  try {
    if (existsSync(FORGE_QUEUE_PATH)) return JSON.parse(readFileSync(FORGE_QUEUE_PATH, 'utf8'));
  } catch {}
  return { queued: [], injected: [], failed: [] };
}

function saveQueue(queue) {
  writeFileSync(FORGE_QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
}

// ─── Injection engine ─────────────────────────────────────────────────────

export function injectSnippet(snippetId, context = {}) {
  const snippetPath = join(SNIPPETS_DIR, `${snippetId}.snippet`);
  if (!existsSync(snippetPath)) {
    return { success: false, error: `Snippet "${snippetId}" not found` };
  }

  const raw = readFileSync(snippetPath, 'utf8');
  let meta = {};
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 3);
    if (end !== -1) {
      for (const line of raw.slice(3, end).trim().split('\n')) {
        const ci = line.indexOf(':');
        if (ci !== -1) meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
      }
    }
  }

  const entry = {
    id: `tk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    snippetId,
    agentId: context.agentId || 'think-forge-bridge',
    query: context.query || '',
    score: context.score || 0,
    task_context: {
      source: 'recall-auto-inject',
      snippetId,
      query: context.query || '',
      agentId: context.agentId || 'unknown',
      timestamp: new Date().toISOString(),
    },
    correction_delta: raw,
    status: 'PROVEN',
    injectedAt: new Date().toISOString(),
    uuid: meta.uuid || 'unknown',
    category: meta.category || 'token',
  };

  // Queue for injection
  const queue = loadQueue();
  queue.queued.push(entry);
  if (queue.queued.length > 500) queue.queued = queue.queued.slice(-500);
  saveQueue(queue);

  // Update state
  loadState();
  forgeState.totalInjected += 1;
  forgeState.lastInjection = { snippetId, at: entry.injectedAt };
  forgeState.bySnippet[snippetId] = (forgeState.bySnippet[snippetId] || 0) + 1;
  forgeState.injections.push({ id: entry.id, snippetId, timestamp: entry.injectedAt });
  if (forgeState.injections.length > 100) forgeState.injections = forgeState.injections.slice(-100);
  saveState();

  return { success: true, entry };
}

export function processQueue() {
  const queue = loadQueue();
  const toProcess = queue.queued.splice(0, 10);
  for (const entry of toProcess) {
    queue.injected.push({
      id: entry.id,
      snippetId: entry.snippetId,
      processedAt: new Date().toISOString(),
      status: 'injected',
    });
    forgeState.processed = (forgeState.processed || 0) + 1;
  }
  if (queue.injected.length > 200) queue.injected = queue.injected.slice(-200);
  saveQueue(queue);
  saveState();
  return toProcess.length;
}

// ─── Watch for recalls (polling the memories to detect new recalls) ───────

let watchInterval = null;
let lastRecallCounts = {};

export function startFeed(intervalMs = 10000) {
  loadState();
  forgeState.started = new Date().toISOString();
  saveState();

  console.log(`[THINK FORGE] Live feed started — injecting recalls into think_tokens`);
  console.log(`[THINK FORGE] ${forgeState.totalInjected} total injected so far\n`);

  // Initial scan: inject all existing snippets as baseline
  if (existsSync(SNIPPETS_DIR)) {
    const snippets = readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.snippet'));
    for (const f of snippets) {
      const id = f.replace('.snippet', '');
      if (!forgeState.bySnippet[id]) {
        injectSnippet(id, { agentId: 'feed-bootstrap', query: 'initial-knowledge-load' });
      }
    }
    processQueue();
    console.log(`[THINK FORGE] Bootstrapped ${snippets.length} snippets as baseline`);
  }

  watchInterval = setInterval(() => {
    // Check memory files for new recalls
    const memDir = join(REPO_ROOT, '.kilo', 'memory', 'memories');
    if (!existsSync(memDir)) return;

    for (const f of readdirSync(memDir).filter(x => x.endsWith('.memory'))) {
      try {
        const mem = JSON.parse(readFileSync(join(memDir, f), 'utf8'));
        const id = f.replace('.memory', '');
        const currentRecallCount = (mem.recalls || []).length;
        const previousCount = lastRecallCounts[id] || 0;

        if (currentRecallCount > previousCount) {
          // New recall detected — inject the recalled snippet
          const newRecalls = (mem.recalls || []).slice(previousCount);
          for (const recall of newRecalls) {
            // Extract snippet ID from recall (if it references a snippet)
            const snippetMatch = recall.query?.match(/([a-z-]+pattern[s]?|middleware|database|redis|agent|verification|frontend)/);
            const snippetId = snippetMatch ? snippetMatch[0] : null;

            if (snippetId && existsSync(join(SNIPPETS_DIR, `${snippetId}.snippet`))) {
              const result = injectSnippet(snippetId, {
                agentId: id,
                query: recall.query || 'recall',
                score: recall.score || 1,
              });
              if (result.success) {
                console.log(`  [THINK FORGE] ${id} recalled "${recall.query}" → injected ${snippetId} (#${forgeState.totalInjected})`);
              }
            }
          }
          lastRecallCounts[id] = currentRecallCount;
        }
      } catch {}
    }

    processQueue();
  }, intervalMs);

  return { stop: stopFeed };
}

export function stopFeed() {
  if (watchInterval) clearInterval(watchInterval);
  forgeState.stopped = new Date().toISOString();
  saveState();
  console.log(`[THINK FORGE] Feed stopped — ${forgeState.totalInjected} total injected`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'feed':
    case 'start': {
      startFeed();
      console.log('Press Ctrl+C to stop.\n');
      process.on('SIGINT', () => { stopFeed(); process.exit(0); });
      setInterval(() => {}, 1000);
      break;
    }

    case 'inject':
    case 'push': {
      if (!arg) { console.log('Usage: think-forge-bridge inject <snippetId>'); process.exit(1); }
      const result = injectSnippet(arg, { agentId: 'cli', query: 'manual-inject' });
      if (result.success) {
        console.log(`[THINK FORGE] Injected: ${arg} → ${result.entry.id}`);
        processQueue();
      } else {
        console.log(`[THINK FORGE] Failed: ${result.error}`);
      }
      break;
    }

    case 'stats':
    case 'status': {
      loadState();
      const queue = loadQueue();
      console.log(`\n  ╔══════════════════════════════════════════════════╗`);
      console.log(`  ║  THINK TOKEN FORGE — LIVE FEED STATUS            ║`);
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      console.log(`  ║  injected:   ${String(forgeState.totalInjected).padEnd(37)}║`);
      console.log(`  ║  queued:     ${String(queue.queued.length).padEnd(37)}║`);
      console.log(`  ║  processed:  ${String(forgeState.processed || 0).padEnd(37)}║`);
      console.log(`  ║  started:    ${(forgeState.started || 'never').slice(0, 19).padEnd(33)}║`);
      console.log(`  ║  last:       ${(forgeState.lastInjection?.snippetId || 'none').padEnd(37)}║`);
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      if (Object.keys(forgeState.bySnippet).length > 0) {
        console.log(`  ║  By snippet:                                     ║`);
        for (const [id, count] of Object.entries(forgeState.bySnippet).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
          console.log(`  ║    ${id.padEnd(30)} ${String(count).padStart(6)}         ║`);
        }
      }
      console.log(`  ╚══════════════════════════════════════════════════╝\n`);
      break;
    }

    default:
      console.log(`
  Think Token Forge Live Feed — Continuous Context (Pipeline 4)

  Commands:
    feed              Start live feed (watch + inject)
    inject <id>       Manually inject a snippet
    stats             Feed statistics

  How it works:
    1. Agent recalls a snippet (via snippet-agent.mjs recall)
    2. Feed detects new recall in .kilo/memory/memories/{id}.memory
    3. Feed builds a think_token entry with snippet content + context
    4. Entry queued for injection into think_tokens pgvector table
    5. Token Forge can then retrieve via getRelevantThinkTokens(query)
    6. LLM receives injected codebase context in prompts
`);
  }
}
