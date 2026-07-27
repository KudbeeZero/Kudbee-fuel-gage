#!/usr/bin/env node
/**
 * scripts/phone-tree.mjs
 * ---------------------------------------------------------------------------
 * Agent Phone Call System — tree-based inter-agent communication.
 *
 * Agents form a tree hierarchy. Each agent can "call" its children or parent.
 * Calls are directed serial bus events with a target agent.
 * The tree defines which agents can reach which others.
 *
 * Tree structure (lives in .kilo/memory/phone-tree.json):
 *   root: dispatcher
 *     ├── pipeline-guardian
 *     │     ├── middleware:rate-limiter
 *     │     └── middleware:auth
 *     ├── ci-watcher
 *     │     └── verification:typecheck
 *     └── knowledge-curator
 *           ├── snippet:recall
 *           └── snippet:inject
 *
 * Usage:
 *   node scripts/phone-tree.mjs tree                Show agent call tree
 *   node scripts/phone-tree.mjs call <from> <to>    Route a call from agent to agent
 *   node scripts/phone-tree.mjs history              Call log
 *   node scripts/phone-tree.mjs stats                Call statistics
 *   node scripts/phone-tree.mjs route <agent>        Show reachable agents
 *   node scripts/phone-tree.mjs ring                 Ring all agents (broadcast)
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const TREE_PATH = join(REPO_ROOT, '.kilo', 'memory', 'phone-tree.json');
const CALL_LOG_PATH = join(REPO_ROOT, '.kilo', 'memory', 'call-log.json');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');

mkdirSync(join(REPO_ROOT, '.kilo', 'memory'), { recursive: true });

// ─── Default tree (auto-built from agents) ─────────────────────────────────

function discoverAgents() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.agent'))
    .map(f => {
      const raw = readFileSync(join(AGENTS_DIR, f), 'utf8');
      const meta = {};
      if (raw.startsWith('---')) {
        const end = raw.indexOf('---', 3);
        if (end !== -1) {
          for (const line of raw.slice(3, end).trim().split('\n')) {
            const ci = line.indexOf(':');
            if (ci !== -1) meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
          }
        }
      }
      return { id: f.replace('.agent', ''), category: meta.category || 'general', schedule: meta.schedule || 'manual' };
    });
}

function buildTree() {
  if (existsSync(TREE_PATH)) {
    try { return JSON.parse(readFileSync(TREE_PATH, 'utf8')); } catch {}
  }

  const agents = discoverAgents();
  const tree = {
    root: 'dispatcher',
    nodes: {
      dispatcher: { id: 'dispatcher', parent: null, children: agents.map(a => a.id) },
    },
  };

  for (const a of agents) {
    tree.nodes[a.id] = { id: a.id, parent: 'dispatcher', children: [], category: a.category };
  }

  return tree;
}

function saveTree(tree) {
  writeFileSync(TREE_PATH, JSON.stringify(tree, null, 2), 'utf8');
}

// ─── Call routing ──────────────────────────────────────────────────────────

function findAgent(tree, id) {
  return tree.nodes[id] || null;
}

function getChildren(tree, id) {
  const node = findAgent(tree, id);
  return node ? node.children || [] : [];
}

function getParent(tree, id) {
  const node = findAgent(tree, id);
  return node ? node.parent : null;
}

function getPath(tree, from, to) {
  // Simple: if "to" is child of "from" → direct
  if (getChildren(tree, from).includes(to)) return { path: [from, to], hops: 1, type: 'down' };
  // If "from" is child of "to" → up
  if (getChildren(tree, to).includes(from)) return { path: [from, to], hops: 1, type: 'up' };
  // Siblings → through parent
  const parentFrom = getParent(tree, from);
  const parentTo = getParent(tree, to);
  if (parentFrom === parentTo) return { path: [from, parentFrom, to], hops: 2, type: 'sibling' };
  // Unknown → dispatcher
  return { path: [from, 'dispatcher', to], hops: 2, type: 'routed' };
}

function makeCall(tree, from, to, message = '') {
  const path = getPath(tree, from, to);
  const call = {
    id: `call-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    from, to, message, path: path.path, hops: path.hops, type: path.type,
    timestamp: new Date().toISOString(),
    routed: path.hops > 1,
  };

  const log = getCallLog();
  log.calls.push(call);
  if (log.calls.length > 200) log.calls = log.calls.slice(-200);
  saveCallLog(log);

  return call;
}

function ringAll(tree, from, message = 'broadcast') {
  const children = getChildren(tree, 'dispatcher');
  const calls = children
    .filter(c => c !== from)
    .map(to => makeCall(tree, from, to, `${message} → ${to}`));
  return calls;
}

// ─── Call log ─────────────────────────────────────────────────────────────

function getCallLog() {
  try {
    if (existsSync(CALL_LOG_PATH)) return JSON.parse(readFileSync(CALL_LOG_PATH, 'utf8'));
  } catch {}
  return { calls: [], totalCalls: 0 };
}

function saveCallLog(log) {
  log.totalCalls = log.calls.length;
  writeFileSync(CALL_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
}

function getCallStats() {
  const log = getCallLog();
  const byAgent = {};
  const byType = {};
  for (const call of log.calls) {
    byAgent[call.from] = (byAgent[call.from] || 0) + 1;
    byType[call.type] = (byType[call.type] || 0) + 1;
  }
  return { totalCalls: log.calls.length, mostRecent: log.calls[log.calls.length - 1] || null, byAgent, byType };
}

// ─── Tree display ──────────────────────────────────────────────────────────

function displayTree(tree, nodeId = 'dispatcher', indent = '') {
  const node = findAgent(tree, nodeId);
  const isRoot = nodeId === 'dispatcher';
  const prefix = isRoot ? '  ●' : '  ├──';
  const label = isRoot ? 'DISPATCHER' : nodeId;

  console.log(`${indent}${prefix} ${label} ${node?.category ? `[${node.category}]` : ''}`);

  const children = getChildren(tree, nodeId);
  for (let i = 0; i < children.length; i++) {
    const isLast = i === children.length - 1;
    const childIndent = indent + (isRoot ? '     ' : '  │   ');
    displayTreeInner(tree, children[i], childIndent, isLast);
  }
}

function displayTreeInner(tree, nodeId, indent, isLast) {
  const node = findAgent(tree, nodeId);
  const prefix = isLast ? '└──' : '├──';
  const label = node ? `${nodeId} [${node.category || '?'}]` : nodeId;

  console.log(`${indent}${prefix} ${label}`);

  const children = getChildren(tree, nodeId);
  for (let i = 0; i < children.length; i++) {
    const childIsLast = i === children.length - 1;
    displayTreeInner(tree, children[i], indent + (isLast ? '    ' : '│   '), childIsLast);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];
const arg2 = process.argv[4];
const rest = process.argv.slice(5).join(' ');

if (import.meta.url === `file://${process.argv[1]}`) {
  const tree = buildTree();

  switch (cmd) {
    case 'tree':
    case 'show': {
      console.log(`\n  Agent Phone Call Tree:\n`);
      displayTree(tree);
      console.log(`\n  ${Object.keys(tree.nodes).length} nodes in tree\n`);
      break;
    }

    case 'call':
    case 'dial': {
      if (!arg || !arg2) { console.log('Usage: phone-tree call <from> <to> [message]'); process.exit(1); }
      const call = makeCall(tree, arg, arg2, rest || 'direct-call');
      console.log(`\n  ☎  Call routed: ${arg} → ${arg2}`);
      console.log(`  Path: ${call.path.join(' → ')}  |  Hops: ${call.hops}  |  Type: ${call.type}`);
      console.log(`  ID: ${call.id}\n`);
      break;
    }

    case 'ring':
    case 'broadcast': {
      const from = arg || 'dispatcher';
      const calls = ringAll(tree, from, rest || 'broadcast');
      console.log(`\n  ☎  Broadcast from ${from} to ${calls.length} agents:\n`);
      for (const c of calls) {
        console.log(`    → ${c.to} (${c.type})`);
      }
      console.log();
      break;
    }

    case 'history':
    case 'log': {
      const log = getCallLog();
      console.log(`\n  Call History (${log.calls.length} calls):\n`);
      for (const call of log.calls.slice(-20).reverse()) {
        const ts = call.timestamp.slice(11, 19);
        const from = call.from.padEnd(20);
        const to = call.to.padEnd(20);
        console.log(`  ${ts} │ ${from} → ${to} │ ${call.type.padEnd(8)} │ ${call.hops} hop`);
      }
      console.log();
      break;
    }

    case 'stats':
    case 'summary': {
      const stats = getCallStats();
      console.log(`\n  ╔══════════════════════════════════════╗`);
      console.log(`  ║  PHONE CALL STATISTICS               ║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  total calls: ${String(stats.totalCalls).padEnd(24)}║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      if (stats.mostRecent) {
        console.log(`  ║  last: ${stats.mostRecent.from} → ${stats.mostRecent.to}`.padEnd(45) + '║');
      }
      console.log(`  ╠══════════════════════════════════════╣`);
      if (Object.keys(stats.byAgent).length > 0) {
        console.log(`  ║  By caller:                          ║`);
        for (const [agent, count] of Object.entries(stats.byAgent).sort((a, b) => b[1] - a[1])) {
          console.log(`  ║    ${agent.padEnd(20)} ${String(count).padStart(6)}           ║`);
        }
      }
      if (Object.keys(stats.byType).length > 0) {
        console.log(`  ║  By route type:                      ║`);
        for (const [type, count] of Object.entries(stats.byType)) {
          console.log(`  ║    ${type.padEnd(20)} ${String(count).padStart(6)}           ║`);
        }
      }
      console.log(`  ╚══════════════════════════════════════╝\n`);
      break;
    }

    case 'route':
    case 'reachable': {
      if (!arg) { console.log('Usage: phone-tree route <agent>'); process.exit(1); }
      const children = getChildren(tree, arg);
      const parent = getParent(tree, arg);
      const siblings = parent ? getChildren(tree, parent).filter(c => c !== arg) : [];
      console.log(`\n  Agent: ${arg}`);
      console.log(`  Parent: ${parent || 'none'}`);
      console.log(`  Children (${children.length}): ${children.join(', ') || 'none'}`);
      console.log(`  Siblings (${siblings.length}): ${siblings.join(', ') || 'none'}`);
      console.log(`  ── Can call: ${[...children, parent, ...siblings].filter(Boolean).join(', ')}\n`);
      break;
    }

    case 'setup':
    case 'init': {
      const agents = discoverAgents();
      const newTree = {
        root: 'dispatcher',
        nodes: {
          dispatcher: { id: 'dispatcher', parent: null, children: agents.map(a => a.id) },
        },
      };
      for (const a of agents) {
        newTree.nodes[a.id] = { id: a.id, parent: 'dispatcher', children: [], category: a.category };
      }
      saveTree(newTree);
      console.log(`\n  [+] Phone tree initialized: ${agents.length} agents under dispatcher\n`);
      displayTree(newTree);
      break;
    }

    default:
      console.log(`
  Agent Phone Call System — tree-based inter-agent communication

  Commands:
    tree                    Show agent call tree (hierarchy)
    call <from> <to> [msg]  Route a call through the tree
    ring [from] [msg]       Broadcast to all agents
    history                 Call log (last 20 calls)
    stats                   Call statistics (by agent, by route type)
    route <agent>           Show who an agent can reach
    setup                   Initialize/rebuild the phone tree from .kilo/agents/

  Tree:
    Stored in .kilo/memory/phone-tree.json
    Root: dispatcher → all agents as direct children
    Each agent can call: parent + children + siblings
    Calls logged in .kilo/memory/call-log.json
`);
  }
}
