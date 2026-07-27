#!/usr/bin/env node
/**
 * scripts/snippet-agent.mjs
 * ---------------------------------------------------------------------------
 * Snippet Agent System — each snippet is a self-contained knowledge entity
 * with identity, memory, relationships, and recall capabilities.
 *
 * Architecture:
 *   .kilo/memory/snippets/{id}.snippet   — the knowledge body (frontmatter + content)
 *   .kilo/memory/memories/{id}.memory    — per-snippet usage memory (recall log)
 *   .kilo/memory/relations.json          — cross-snippet relationship graph
 *
 * Usage:
 *   node scripts/snippet-agent.mjs list              # List all snippet agents
 *   node scripts/snippet-agent.mjs recall <query>    # Semantic recall (fuzzy match)
 *   node scripts/snippet-agent.mjs relate <a> <b>    # Create relationship between snippets
 *   node scripts/snippet-agent.mjs graph <id>         # Show relationship graph for snippet
 *   node scripts/snippet-agent.mjs touch <id>         # Record usage memory for snippet
 *   node scripts/snippet-agent.mjs identity <id>      # Show full identity + metadata
 *   node scripts/snippet-agent.mjs inject <id>        # Inject single snippet into Think Token Forge
 *   node scripts/snippet-agent.mjs health             # Full system health check
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const MEMORIES_DIR = join(REPO_ROOT, '.kilo', 'memory', 'memories');
const RELATIONS_PATH = join(REPO_ROOT, '.kilo', 'memory', 'relations.json');

mkdirSync(SNIPPETS_DIR, { recursive: true });
mkdirSync(MEMORIES_DIR, { recursive: true });

// ─── Core Types ─────────────────────────────────────────────────────────────

function loadSnippet(id) {
  const path = join(SNIPPETS_DIR, `${id}.snippet`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const meta = {};
  let body = raw;
  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('---', 3);
    if (endIdx !== -1) {
      for (const line of raw.slice(3, endIdx).trim().split('\n')) {
        const ci = line.indexOf(':');
        if (ci !== -1) {
          meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
        }
      }
      body = raw.slice(endIdx + 3).trim();
    }
  }
  return {
    id,
    path,
    uuid: meta.uuid || 'unknown',
    category: meta.category || 'general',
    tags: (meta.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    created: meta.created || 'unknown',
    meaning: meta.meaning || body.split('\n')[0]?.replace(/^#+\s*/, '') || id,
    content: body,
    size: body.length,
    meta,
  };
}

function loadAllSnippets() {
  if (!existsSync(SNIPPETS_DIR)) return [];
  return readdirSync(SNIPPETS_DIR)
    .filter(f => f.endsWith('.snippet'))
    .map(f => loadSnippet(basename(f, '.snippet')))
    .filter(Boolean);
}

function loadMemory(id) {
  const path = join(MEMORIES_DIR, `${id}.memory`);
  if (!existsSync(path)) return { id, recalls: [], lastRecall: null, recallCount: 0 };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { id, recalls: [], lastRecall: null, recallCount: 0 };
  }
}

function saveMemory(id, memory) {
  writeFileSync(join(MEMORIES_DIR, `${id}.memory`), JSON.stringify(memory, null, 2), 'utf8');
}

function loadRelations() {
  if (!existsSync(RELATIONS_PATH)) return { nodes: {}, edges: [] };
  try {
    return JSON.parse(readFileSync(RELATIONS_PATH, 'utf8'));
  } catch {
    return { nodes: {}, edges: [] };
  }
}

function saveRelations(rel) {
  writeFileSync(RELATIONS_PATH, JSON.stringify(rel, null, 2), 'utf8');
}

// ─── Commands ────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  case 'list':
  case 'ls': {
    const snippets = loadAllSnippets();
    console.log(`\n  Snippet Agents (${snippets.length}):\n`);
    for (const s of snippets) {
      const mem = loadMemory(s.id);
      console.log(`  ${s.id}`);
      console.log(`    meaning: ${s.meaning}`);
      console.log(`    category: ${s.category}  |  tags: [${s.tags.join(', ') || '—'}]`);
      console.log(`    recalls: ${mem.recallCount}  |  last: ${mem.lastRecall || 'never'}  |  size: ${s.size}B`);
      console.log();
    }
    break;
  }

  case 'recall':
  case 'remember': {
    if (!arg) { console.log('Usage: snippet-agent recall <query>'); process.exit(1); }
    const query = arg.toLowerCase();
    const snippets = loadAllSnippets();
    const scored = snippets.map(s => {
      let score = 0;
      const body = s.content.toLowerCase();
      // Title match
      if (s.id.toLowerCase().includes(query)) score += 10;
      if (s.meaning.toLowerCase().includes(query)) score += 8;
      // Tag match
      for (const tag of s.tags) {
        if (tag.toLowerCase().includes(query) || query.includes(tag.toLowerCase())) score += 5;
      }
      // Content relevance: count word frequency
      for (const word of query.split(/\s+/)) {
        if (word.length < 3) continue;
        const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = body.match(regex);
        if (matches) score += Math.min(matches.length, 5);
      }
      // Recency boost
      const mem = loadMemory(s.id);
      if (mem.recallCount > 0) score += Math.min(mem.recallCount, 5);
      return { ...s, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      console.log(`\n  No matches for "${arg}". Try broader terms.\n`);
      process.exit(0);
    }

    console.log(`\n  Recall: "${arg}" — ${scored.length} results:\n`);
    for (const s of scored.slice(0, 5)) {
      console.log(`  ▸ ${s.id}  (score: ${s.score})`);
      console.log(`    ${s.meaning}`);
      console.log(`    ${s.content.split('\n').slice(0, 3).map(l => '    ' + l).join('\n')}`);
      console.log(`    ── ${s.tags.join(' · ')}  |  recalls: ${loadMemory(s.id).recallCount}\n`);

      // Record recall memory
      const mem = loadMemory(s.id);
      mem.recalls.push({ query, timestamp: new Date().toISOString(), score: s.score });
      if (mem.recalls.length > 50) mem.recalls = mem.recalls.slice(-50);
      mem.lastRecall = new Date().toISOString();
      mem.recallCount = mem.recalls.length;
      saveMemory(s.id, mem);
    }
    break;
  }

  case 'relate':
  case 'link': {
    const b = process.argv[4];
    if (!arg || !b) { console.log('Usage: snippet-agent relate <idA> <idB>'); process.exit(1); }
    const a = loadSnippet(arg);
    const sb = loadSnippet(b);
    if (!a) { console.log(`Snippet "${arg}" not found`); process.exit(1); }
    if (!sb) { console.log(`Snippet "${b}" not found`); process.exit(1); }

    const rel = loadRelations();
    if (!rel.nodes[arg]) rel.nodes[arg] = { id: arg, meaning: a.meaning, edges: [] };
    if (!rel.nodes[b]) rel.nodes[b] = { id: b, meaning: sb.meaning, edges: [] };
    if (!rel.nodes[arg].edges.includes(b)) rel.nodes[arg].edges.push(b);
    if (!rel.nodes[b].edges.includes(arg)) rel.nodes[b].edges.push(arg);
    rel.edges.push({ from: arg, to: b, created: new Date().toISOString() });
    if (rel.edges.length > 200) rel.edges = rel.edges.slice(-200);
    saveRelations(rel);
    console.log(`  [+] Linked: ${arg} ↔ ${b}`);
    break;
  }

  case 'graph':
  case 'relations': {
    if (!arg) { console.log('Usage: snippet-agent graph <id> [depth]'); process.exit(1); }
    const depth = parseInt(process.argv[4]) || 2;
    const rel = loadRelations();
    const visited = new Set();
    function walk(id, d, prefix) {
      if (d > depth || visited.has(id)) return;
      visited.add(id);
      const node = rel.nodes[id];
      const s = loadSnippet(id);
      const mem = loadMemory(id);
      console.log(`${prefix}${s ? s.meaning : id}  (recalls: ${mem.recallCount})`);
      if (node && node.edges) {
        for (const edge of node.edges) {
          walk(edge, d + 1, prefix + '  ');
        }
      }
    }
    console.log(`\n  Knowledge Graph: ${arg} (depth ${depth})\n`);
    walk(arg, 0, '  ');
    break;
  }

  case 'touch':
  case 'use': {
    if (!arg) { console.log('Usage: snippet-agent touch <id>'); process.exit(1); }
    const s = loadSnippet(arg);
    if (!s) { console.log(`Snippet "${arg}" not found`); process.exit(1); }
    const mem = loadMemory(arg);
    mem.recalls.push({ query: 'direct-touch', timestamp: new Date().toISOString(), score: 0 });
    if (mem.recalls.length > 50) mem.recalls = mem.recalls.slice(-50);
    mem.lastRecall = new Date().toISOString();
    mem.recallCount = mem.recalls.length;
    saveMemory(arg, mem);
    console.log(`  [+] Touched: ${arg} (recall #${mem.recallCount})`);
    break;
  }

  case 'identity':
  case 'info': {
    if (!arg) { console.log('Usage: snippet-agent identity <id>'); process.exit(1); }
    const s = loadSnippet(arg);
    if (!s) { console.log(`Snippet "${arg}" not found`); process.exit(1); }
    const mem = loadMemory(arg);
    const rel = loadRelations();
    const node = rel.nodes[arg];

    console.log(`\n  ╔════════════════════════════════════════╗`);
    console.log(`  ║  SNIPPET AGENT: ${s.id.padEnd(25)}║`);
    console.log(`  ╠════════════════════════════════════════╣`);
    console.log(`  ║  meaning:  ${s.meaning}`);
    console.log(`  ║  category: ${s.category}`);
    console.log(`  ║  tags:     ${s.tags.join(', ') || '—'}`);
    console.log(`  ║  size:     ${s.size}B`);
    console.log(`  ║  created:  ${s.created}`);
    console.log(`  ║  uuid:     ${s.uuid}`);
    console.log(`  ╠════════════════════════════════════════╣`);
    console.log(`  ║  MEMORY:`);
    console.log(`  ║    recalls:  ${mem.recallCount}`);
    console.log(`  ║    last:     ${mem.lastRecall || 'never'}`);
    console.log(`  ║    history:  ${mem.recalls.slice(-5).map(r => r.query).join(' → ') || '—'}`);
    console.log(`  ╠════════════════════════════════════════╣`);
    if (node && node.edges.length > 0) {
      console.log(`  ║  RELATIONS:`);
      for (const edge of node.edges) console.log(`  ║    ↔ ${edge}`);
    }
    console.log(`  ╚════════════════════════════════════════╝\n`);
    break;
  }

  case 'inject':
  case 'push': {
    if (!arg) { console.log('Usage: snippet-agent inject <id>'); process.exit(1); }
    const s = loadSnippet(arg);
    if (!s) { console.log(`Snippet "${arg}" not found`); process.exit(1); }

    const mem = loadMemory(arg);
    mem.recalls.push({ query: 'inject-to-forge', timestamp: new Date().toISOString(), score: 0 });
    mem.recallCount = mem.recalls.length;
    saveMemory(arg, mem);

    console.log(`\n  [+] Snippet "${arg}" queued for Think Token Forge injection.`);
    console.log(`  [+] Memory updated: recall #${mem.recallCount}`);
    console.log(`  [+] Run: node scripts/inject-knowledge-tokens.mjs to push.\n`);
    break;
  }

  case 'health':
  case 'status': {
    const snippets = loadAllSnippets();
    const rel = loadRelations();
    let totalRecalls = 0;
    for (const s of snippets) {
      totalRecalls += loadMemory(s.id).recallCount;
    }

    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║  SNIPPET AGENT SYSTEM HEALTH        ║`);
    console.log(`  ╠══════════════════════════════════════╣`);
    console.log(`  ║  agents:     ${String(snippets.length).padEnd(23)}║`);
    console.log(`  ║  total size: ${(snippets.reduce((a,s) => a + s.size, 0)).toLocaleString().padEnd(18)}B  ║`);
    console.log(`  ║  relations:  ${String(rel.edges.length).padEnd(23)}║`);
    console.log(`  ║  nodes:      ${String(Object.keys(rel.nodes).length).padEnd(23)}║`);
    console.log(`  ║  recalls:    ${String(totalRecalls).padEnd(23)}║`);
    console.log(`  ╠══════════════════════════════════════╣`);
    console.log(`  ║  Status: ${snippets.length >= 8 ? 'HEALTHY' : 'DEGRADED'}`.padEnd(43) + '║');
    console.log(`  ╚══════════════════════════════════════╝\n`);

    // Show most-recalled
    const topRecalled = snippets
      .map(s => ({ id: s.id, meaning: s.meaning, recallCount: loadMemory(s.id).recallCount }))
      .sort((a, b) => b.recallCount - a.recallCount)
      .slice(0, 3);

    if (topRecalled.length > 0 && topRecalled[0].recallCount > 0) {
      console.log('  Most recalled:\n');
      for (const t of topRecalled) {
        console.log(`    ${t.id.padEnd(40)} ${t.recallCount} recalls`);
      }
      console.log();
    }
    break;
  }

  default:
    console.log(`
  Snippet Agent System — self-contained knowledge entities

  Each snippet has: identity (uuid), meaning (description), memory (recall log),
  relations (knowledge graph edges).

  Commands:
    list              List all agents with memory stats
    recall <query>    Semantic recall with scoring + memory recording
    relate <a> <b>    Create bidirectional relationship
    graph <id>        Show knowledge graph for an agent
    touch <id>        Record manual usage memory
    identity <id>     Full identity card (meaning, memory, relations)
    inject <id>       Queue for Think Token Forge injection
    health            System health check

  Files:
    .kilo/memory/snippets/{id}.snippet   Knowledge bodies
    .kilo/memory/memories/{id}.memory    Per-agent recall logs
    .kilo/memory/relations.json          Knowledge graph edges
`);
}
