#!/usr/bin/env node
/**
 * scripts/knowledge-lifecycle.mjs — INT-040 Knowledge Lifecycle Engine
 * ---------------------------------------------------------------------------
 * Every durable knowledge object (THINK Token, Benchmark, Decision, Skill,
 * Bootstrap, Forge Optimization) must have a complete lifecycle:
 * ownership, verification, review dates, retirement rules.
 *
 * Lifecycle states (only these):
 *   DRAFT → VERIFIED → ACTIVE → STALE → SUPERSEDED → ARCHIVED
 *
 * The engine:
 *   - Registers knowledge objects into .kilo/knowledge-index.json
 *   - Transitions states (append-only: each transition recorded)
 *   - Flags objects due for review / expired
 *
 * No knowledge object is ever deleted — retirement is a state change.
 *
 * Usage:
 *   node scripts/knowledge-lifecycle.mjs register <type> <id> --owner INT-001 \
 *     --confidence 0.91 --references "BMK-0007,DEC-0003"
 *   node scripts/knowledge-lifecycle.mjs transition <id> ACTIVE
 *   node scripts/knowledge-lifecycle.mjs show <id>
 *   node scripts/knowledge-lifecycle.mjs list
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'knowledge-index.json');

mkdirSync(dirname(INDEX_PATH), { recursive: true });

const VALID_TYPES = ['think_token', 'benchmark', 'decision', 'skill', 'bootstrap', 'forge_optimization', 'learning'];
const VALID_STATES = ['DRAFT', 'VERIFIED', 'ACTIVE', 'STALE', 'SUPERSEDED', 'ARCHIVED'];

// Default review cadence per type (days).
const REVIEW_CADENCE = {
  think_token: 30,
  benchmark: 90,
  decision: 90,
  skill: 60,
  bootstrap: 60,
  forge_optimization: 30,
  learning: 30,
};

function loadIndex() {
  try {
    if (existsSync(INDEX_PATH)) return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), objects: [], transitions: [] };
}

function saveIndex(index) {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function register(opts) {
  const index = loadIndex();
  if (index.objects.some((o) => o.id === opts.id)) {
    throw new Error(`Duplicate id: ${opts.id} — knowledge IDs must be unique`);
  }
  if (!VALID_TYPES.includes(opts.type)) {
    throw new Error(`Invalid type ${opts.type}. Allowed: ${VALID_TYPES.join(', ')}`);
  }
  if (!opts.owner) {
    throw new Error('Missing owner — every knowledge object must have an owner');
  }

  const created = today();
  const cadence = REVIEW_CADENCE[opts.type] ?? 90;
  const object = {
    id: opts.id,
    type: opts.type,
    owner: opts.owner,
    created,
    verified: opts.verified || null,
    review_after: addDays(created, cadence),
    expires: opts.expires || null,
    confidence: opts.confidence != null ? Number(opts.confidence) : null,
    status: 'DRAFT',
    supersedes: (opts.supersedes || '').split(',').map((s) => s.trim()).filter(Boolean),
    superseded_by: null,
    references: (opts.references || '').split(',').map((s) => s.trim()).filter(Boolean),
    evidence: opts.evidence || '',
  };

  index.objects.push(object);
  index.transitions.push({ id: opts.id, from: null, to: 'DRAFT', at: new Date().toISOString(), by: opts.owner });
  saveIndex(index);
  return object;
}

function transition(id, toState, by = 'knowledge-lifecycle') {
  const index = loadIndex();
  const obj = index.objects.find((o) => o.id === id);
  if (!obj) throw new Error(`Knowledge object not found: ${id}`);
  if (!VALID_STATES.includes(toState)) {
    throw new Error(`Invalid state ${toState}. Allowed: ${VALID_STATES.join(', ')}`);
  }
  const from = obj.status;
  obj.status = toState;
  if (toState === 'VERIFIED' && !obj.verified) obj.verified = today();
  if (toState === 'SUPERSEDED') obj.superseded_by = obj.superseded_by || by;
  index.transitions.push({ id, from, to: toState, at: new Date().toISOString(), by });
  saveIndex(index);
  return { id, from, to: toState };
}

const args = process.argv.slice(2);
const cmd = args[0];

// Cross-platform entry-point guard (Windows path separators differ from
// import.meta.url's forward slashes, so a raw === comparison silently no-ops).
if (process.argv[1] && import.meta.url.endsWith('/' + process.argv[1].split(/[\\/]/).pop())) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : undefined;
  };

  switch (cmd) {
    case 'register': {
      const type = args[1];
      const id = args[2];
      if (!type || !id) { console.error('Usage: register <type> <id> --owner <owner> [--confidence N] [--references "a,b"]'); process.exit(1); }
      try {
        const obj = register({
          type,
          id,
          owner: flag('--owner'),
          confidence: flag('--confidence'),
          references: flag('--references'),
          supersedes: flag('--supersedes'),
          verified: flag('--verified'),
          evidence: flag('--evidence'),
        });
        console.log(`[LIFECYCLE] Registered ${obj.id} (${obj.type}) owner=${obj.owner} status=DRAFT review_after=${obj.review_after}`);
      } catch (e) {
        console.error(`[LIFECYCLE] ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'transition': {
      const id = args[1];
      const to = args[2];
      if (!id || !to) { console.error('Usage: transition <id> <DRAFT|VERIFIED|ACTIVE|STALE|SUPERSEDED|ARCHIVED>'); process.exit(1); }
      try {
        const r = transition(id, to);
        console.log(`[LIFECYCLE] ${r.id}: ${r.from || '—'} → ${r.to}`);
      } catch (e) {
        console.error(`[LIFECYCLE] ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'show': {
      const id = args[1];
      const index = loadIndex();
      const obj = index.objects.find((o) => o.id === id);
      if (!obj) { console.error(`Not found: ${id}`); process.exit(1); }
      console.log(`\n  ${obj.id}  (${obj.type})  [${obj.status}]`);
      console.log(`  owner:        ${obj.owner}`);
      console.log(`  created:      ${obj.created}   verified: ${obj.verified || '—'}`);
      console.log(`  review_after: ${obj.review_after}   expires: ${obj.expires || '—'}`);
      console.log(`  confidence:   ${obj.confidence != null ? obj.confidence : '—'}`);
      console.log(`  supersedes:   ${obj.supersedes.length ? obj.supersedes.join(', ') : '—'}   superseded_by: ${obj.superseded_by || '—'}`);
      console.log(`  references:   ${obj.references.length ? obj.references.join(', ') : '—'}`);
      if (obj.evidence) console.log(`  evidence:     ${obj.evidence}`);
      console.log('');
      break;
    }

    case 'list': {
      const index = loadIndex();
      console.log('\n  Knowledge lifecycle index:');
      for (const o of index.objects) {
        console.log(`  ${o.id.padEnd(16)} ${o.type.padEnd(18)} [${o.status.padEnd(10)}] owner=${o.owner.padEnd(10)} review=${o.review_after}`);
      }
      console.log(`  total: ${index.objects.length}  transitions: ${index.transitions.length}\n`);
      break;
    }

    default:
      console.log(`
  INT-040 Knowledge Lifecycle Engine

  Commands:
    register <type> <id> --owner <owner> [--confidence N] [--references "a,b"]
    transition <id> <state>
    show <id>
    list

  Types: think_token | benchmark | decision | skill | bootstrap | forge_optimization
  States: DRAFT | VERIFIED | ACTIVE | STALE | SUPERSEDED | ARCHIVED
`);
      process.exit(1);
  }
}
