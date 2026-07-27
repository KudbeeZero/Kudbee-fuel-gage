#!/usr/bin/env node
/**
 * scripts/agents.mjs — Terminal Agent Management System
 * ---------------------------------------------------------------------------
 * Manages a fleet of terminal-based autonomous agents. Each agent is a
 * self-contained .agent file (.kilo/agents/{id}.agent) with:
 *   - YAML frontmatter: identity, memory, triggers, schedule
 *   - Executable body: bash actions, node snippets, decision scripts
 *
 * Architecture:
 *   .kilo/agents/{id}.agent       Agent definitions (frontmatter + script)
 *   .kilo/memory/snippets/        Shared knowledge store
 *   .kilo/memory/memories/        Per-agent recall logs
 *   .kilo/memory/decisions/       Decision audit trail
 *   .kilo/memory/relations.json   Cross-agent knowledge graph
 *   .kilo/memory/journal.json     Session-level management state
 *
 * Usage:
 *   node scripts/agents.mjs list                     List all agents
 *   node scripts/agents.mjs create <id> <category>   Create new agent from template
 *   node scripts/agents.mjs run <id>                 Execute agent's action script
 *   node scripts/agents.mjs recall <id> <query>      Agent-specific recall
 *   node scripts/agents.mjs decide <id> <decision>   Log a decision to audit trail
 *   node scripts/agents.mjs decode <id>              Decode recent decisions
 *   node scripts/agents.mjs update <id>              Refresh agent knowledge from snippets
 *   node scripts/agents.mjs status                   System management dashboard
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const MEMORIES_DIR = join(REPO_ROOT, '.kilo', 'memory', 'memories');
const DECISIONS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'decisions');
const JOURNAL_PATH = join(REPO_ROOT, '.kilo', 'memory', 'journal.json');

[AGENTS_DIR, MEMORIES_DIR, DECISIONS_DIR].forEach(d => mkdirSync(d, { recursive: true }));

// ─── Agent Parser ───────────────────────────────────────────────────────────

function parseAgent(id) {
  const path = join(AGENTS_DIR, `${id}.agent`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const meta = {};
  let script = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 3);
    if (end !== -1) {
      for (const line of raw.slice(3, end).trim().split('\n')) {
        const ci = line.indexOf(':');
        if (ci !== -1) meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
      }
      script = raw.slice(end + 3).trim();
    }
  }
  return { id, path, category: meta.category || 'general', description: meta.description || id,
    triggers: (meta.triggers || '').split(',').map(s => s.trim()).filter(Boolean),
    schedule: meta.schedule || 'manual', actions: (meta.actions || '').split(',').map(s => s.trim()).filter(Boolean),
    memoryId: meta.memoryId || id, uuid: meta.uuid || 'pending', created: meta.created || 'unknown',
    script, size: script.length };
}

function listAgents() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent')).map(f => parseAgent(basename(f, '.agent'))).filter(Boolean);
}

function loadMemory(id) {
  const p = join(MEMORIES_DIR, `${id}.memory`);
  if (!existsSync(p)) return { id, recalls: [], decisions: [], lastAction: null, totalActions: 0 };
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return { id, recalls: [], decisions: [], lastAction: null, totalActions: 0 }; }
}

function saveMemory(id, mem) {
  writeFileSync(join(MEMORIES_DIR, `${id}.memory`), JSON.stringify(mem, null, 2), 'utf8');
}

function logDecision(agentId, decision, context) {
  const d = { id: `dec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    agentId, decision, context, timestamp: new Date().toISOString(), decoded: false };
  writeFileSync(join(DECISIONS_DIR, `${d.id}.json`), JSON.stringify(d, null, 2), 'utf8');
  return d;
}

function loadDecisions(agentId) {
  if (!existsSync(DECISIONS_DIR)) return [];
  return readdirSync(DECISIONS_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8')); } catch { return null; }
  }).filter(d => d && d.agentId === agentId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ─── Snippet Search ─────────────────────────────────────────────────────────

function searchSnippets(query) {
  if (!existsSync(SNIPPETS_DIR)) return [];
  const q = query.toLowerCase();
  return readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.snippet')).map(f => {
    const raw = readFileSync(join(SNIPPETS_DIR, f), 'utf8');
    const id = basename(f, '.snippet');
    let score = 0;
    if (id.toLowerCase().includes(q)) score += 10;
    for (const word of q.split(/\s+/)) {
      if (word.length < 3) continue;
      const matches = raw.toLowerCase().match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
      if (matches) score += Math.min(matches.length, 5);
    }
    return { id, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
}

// ─── Commands ───────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];
const rest = process.argv.slice(3).join(' ');

switch (cmd) {
  case 'list':
  case 'ls': {
    const agents = listAgents();
    console.log(`\n  Terminal Agents (${agents.length}):\n`);
    for (const a of agents) {
      const mem = loadMemory(a.id);
      console.log(`  ${a.id}`);
      console.log(`    category: ${a.category}  |  schedule: ${a.schedule}`);
      console.log(`    actions:  ${a.actions.join(', ') || '—'}  |  triggers: [${a.triggers.join(', ') || '—'}]`);
      console.log(`    memory:   ${mem.totalActions} actions  |  last: ${mem.lastAction || 'never'}`);
      console.log();
    }
    break;
  }

  case 'create':
  case 'new': {
    if (!arg) { console.log('Usage: agents create <id> <category>'); process.exit(1); }
    const cat = process.argv[4] || 'general';
    const uuid = crypto.randomUUID();
    const template = [
      '---',
      `category: ${cat}`,
      `description: ${arg} — terminal agent`,
      `triggers: manual`,
      `schedule: manual`,
      `actions: recall, decode, update`,
      `uuid: ${uuid}`,
      `memoryId: ${arg}`,
      `created: ${new Date().toISOString()}`,
      '---',
      '',
      `# Agent: ${arg}`,
      '',
      '# Action script (bash):',
      '# echo "[${arg}] executing..."',
      '# echo "Task: $1"',
      '',
      '# Recall: search snippets for context',
      '# node scripts/snippet-agent.mjs recall "$1"',
      '',
      '# Decision: log this action',
      '# node scripts/agents.mjs decide ${arg} "$1_started"',
    ].join('\n');
    const p = join(AGENTS_DIR, `${arg}.agent`);
    if (existsSync(p)) { console.log(`Agent "${arg}" already exists`); process.exit(1); }
    writeFileSync(p, template, 'utf8');
    console.log(`  [+] Created agent: ${arg}.agent (${uuid})`);
    break;
  }

  case 'run':
  case 'exec': {
    if (!arg) { console.log('Usage: agents run <id> [task]'); process.exit(1); }
    const a = parseAgent(arg);
    if (!a) { console.log(`Agent "${arg}" not found`); process.exit(1); }
    const task = process.argv.slice(4).join(' ') || 'default';

    const mem = loadMemory(a.id);
    mem.totalActions += 1;
    mem.lastAction = new Date().toISOString();
    saveMemory(a.id, mem);

    const decision = logDecision(a.id, `run:${task}`, { action: 'execute', task, triggeredBy: 'manual' });

    console.log(`\n  ▸ Agent: ${a.id}  |  Task: ${task}  |  Action #${mem.totalActions}`);
    console.log(`  ▸ Decision: ${decision.id}\n`);
    console.log(`  ── Script Output ──\n`);
    try {
      const result = execSync(a.script, { cwd: REPO_ROOT, timeout: 30000, encoding: 'utf8',
        env: { ...process.env, AGENT_TASK: task, AGENT_ID: a.id, DECISION_ID: decision.id } });
      console.log(result || '  (script executed, no output)');
    } catch (err) {
      console.log(`  [!] Script error: ${err.message}`);
      logDecision(a.id, `error:${task}`, { error: err.message });
    }
    console.log(`\n  ▸ Complete. Decision ${decision.id} logged.`);
    break;
  }

  case 'recall':
  case 'remember': {
    if (!arg) { console.log('Usage: agents recall <id> <query>'); process.exit(1); }
    const query = process.argv.slice(4).join(' ') || arg;
    const a = parseAgent(arg);
    if (!a) { console.log(`Agent "${arg}" not found`); process.exit(1); }

    console.log(`\n  ▸ Agent: ${arg}  |  Recall: "${query}"\n`);
    const results = searchSnippets(query);
    if (results.length === 0) { console.log('  No matching knowledge found.\n'); process.exit(0); }

    for (const r of results.slice(0, 5)) {
      console.log(`  ▸ ${r.id}  (score: ${r.score})`);
    }

    const mem = loadMemory(a.id);
    mem.recalls.push({ query, timestamp: new Date().toISOString(), results: results.slice(0, 5).map(r => r.id) });
    mem.totalActions += 1;
    mem.lastAction = new Date().toISOString();
    saveMemory(a.id, mem);
    logDecision(a.id, `recall:${query}`, { matches: results.slice(0, 5).map(r => r.id) });
    console.log(`\n  ▸ Recall logged. ${results.length} total matches.\n`);
    break;
  }

  case 'decide':
  case 'log': {
    if (!arg) { console.log('Usage: agents decide <id> <decision> [context]'); process.exit(1); }
    const decision = process.argv[4] || 'action';
    const context = process.argv.slice(5).join(' ') || 'manual trigger';
    const d = logDecision(arg, decision, { context, source: 'terminal' });

    const mem = loadMemory(arg);
    mem.decisions.push({ id: d.id, decision, timestamp: d.timestamp });
    mem.totalActions += 1;
    mem.lastAction = d.timestamp;
    saveMemory(arg, mem);

    console.log(`\n  [+] Decision logged: ${d.id}`);
    console.log(`  [+] Agent: ${arg}  |  Decision: ${decision}  |  Context: ${context}\n`);
    break;
  }

  case 'decode':
  case 'audit': {
    if (!arg) { console.log('Usage: agents decode <id>'); process.exit(1); }
    const decisions = loadDecisions(arg);
    console.log(`\n  ▸ Agent: ${arg}  |  Decisions: ${decisions.length}\n`);

    const categories = {};
    for (const d of decisions.slice(0, 50)) {
      const type = d.decision?.split(':')[0] || 'unknown';
      categories[type] = (categories[type] || 0) + 1;
      console.log(`  ${d.timestamp?.slice(0, 19) || '?'}  ${d.decision?.slice(0, 50) || '?'}`);
    }

    console.log(`\n  Decision Categories:`);
    for (const [k, v] of Object.entries(categories)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log();
    break;
  }

  case 'update':
  case 'refresh': {
    if (!arg) { console.log('Usage: agents update <id>'); process.exit(1); }
    const a = parseAgent(arg);
    if (!a) { console.log(`Agent "${arg}" not found`); process.exit(1); }

    const topics = a.triggers.length > 0 ? a.triggers.join(' ') : a.category;
    const results = searchSnippets(topics);

    console.log(`\n  ▸ Updating agent: ${arg} from ${results.length} knowledge snippets\n`);
    for (const r of results.slice(0, 10)) {
      console.log(`  ▸ ${r.id} (score: ${r.score})`);
    }

    const mem = loadMemory(a.id);
    mem.updatedAt = new Date().toISOString();
    mem.knowledgeSources = results.slice(0, 10).map(r => r.id);
    mem.totalActions += 1;
    saveMemory(a.id, mem);
    logDecision(a.id, 'update:knowledge', { sources: results.slice(0, 10).map(r => r.id) });
    console.log(`\n  [+] Agent ${arg} updated with ${Math.min(results.length, 10)} knowledge sources.\n`);
    break;
  }

  case 'status':
  case 'dashboard': {
    const agents = listAgents();
    const decisions = readdirSync(DECISIONS_DIR).filter(f => f.endsWith('.json')).length;

    let totalActions = 0, totalRecalls = 0;
    const agentMemories = {};
    for (const a of agents) {
      const mem = loadMemory(a.id);
      totalActions += mem.totalActions || 0;
      totalRecalls += (mem.recalls || []).length;
      agentMemories[a.id] = mem;
    }

    console.log(`\n  ╔══════════════════════════════════════════════════════╗`);
    console.log(`  ║        TERMINAL AGENT MANAGEMENT SYSTEM              ║`);
    console.log(`  ╠══════════════════════════════════════════════════════╣`);
    console.log(`  ║  agents:    ${String(agents.length).padEnd(41)}║`);
    console.log(`  ║  decisions: ${String(decisions).padEnd(41)}║`);
    console.log(`  ║  actions:   ${String(totalActions).padEnd(41)}║`);
    console.log(`  ║  recalls:   ${String(totalRecalls).padEnd(41)}║`);
    console.log(`  ╠══════════════════════════════════════════════════════╣`);
    console.log(`  ║  AGENT TASK QUEUE                                    ║`);
    for (const a of agents) {
      const mem = agentMemories[a.id];
      const pending = (mem.decisions || []).length;
      console.log(`  ║    ${a.id.padEnd(20)} ${a.schedule.padEnd(8)} ${String(pending).padEnd(4)} decisions  ║`);
    }
    console.log(`  ╠══════════════════════════════════════════════════════╣`);
    console.log(`  ║  LAYER STATUS                        ║`);
    console.log(`  ║    [✓] Memory layer     (${readdirSync(MEMORIES_DIR).filter(f => f.endsWith('.memory')).length} files)`.padEnd(57) + '║');
    console.log(`  ║    [✓] Snippet layer    (${existsSync(SNIPPETS_DIR) ? readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.snippet')).length : 0} files)`.padEnd(57) + '║');
    console.log(`  ║    [✓] Decision layer   (${decisions} files)`.padEnd(57) + '║');
    console.log(`  ║    [✓] Journal layer    (${existsSync(JOURNAL_PATH) ? 'active' : 'missing'})`.padEnd(57) + '║');
    console.log(`  ╚══════════════════════════════════════════════════════╝\n`);
    break;
  }

  default:
    console.log(`
  Terminal Agent Management System

  Commands:
    list                      List all agents
    create <id> <category>    Create new agent from template
    run <id> [task]           Execute agent's action script
    recall <id> <query>       Agent-specific semantic recall
    decide <id> <decision>    Log a decision to audit trail
    decode <id>               Decode/audit agent's recent decisions
    update <id>               Refresh agent knowledge from snippets
    status                    System management dashboard

  Layers:
    .kilo/agents/{id}.agent        Agent definitions (frontmatter + script)
    .kilo/memory/memories/{id}.memory   Per-agent recall & action logs
    .kilo/memory/decisions/dec-*.json   Decision audit trail
    .kilo/memory/relations.json         Cross-agent knowledge graph
`);
}
