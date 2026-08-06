#!/usr/bin/env node
/**
 * scripts/stab003-inventory.mjs — STAB-003 Six-Task Consolidation Inventory
 * ---------------------------------------------------------------------------
 * Produces the audit deliverables:
 *   script-audit.json         — classify scripts KEEP/MERGE/ARCHIVE/DELETE
 *   terminal-audit.json       — terminal command inventory
 *   workflow-audit.json       — CI/workflow classification
 *   documentation-audit.json  — doc classification (keep/archive/stale)
 *   knowledge-audit.json      — duplicate reference detection
 *
 * Classifications are heuristic + deterministic. Human confirms before action.
 *
 * Usage:
 *   node scripts/stab003-inventory.mjs          # write all audit files
 *   node scripts/stab003-inventory.mjs --json   # print script-audit
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'benchmarks');

function loadPkg() {
  try { return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')); } catch { return { scripts: {} }; }
}

/** Script audit: is the script wired into package.json? */
function scriptAudit() {
  const pkg = loadPkg();
  const wired = new Set(Object.values(pkg.scripts || {}));
  const scripts = [];
  try {
    for (const f of readdirSync(join(REPO_ROOT, 'scripts'))) {
      if (!/\.(mjs|js|ts)$/.test(f)) continue;
      const referenced = [...wired].some((v) => v.includes(f));
      const recent = statSync(join(REPO_ROOT, 'scripts', f)).mtimeMs;
      const ageDays = Math.round((Date.now() - recent) / 86400000);
      let action = 'KEEP';
      if (!referenced && ageDays > 60) action = 'ARCHIVE';
      else if (!referenced) action = 'MERGE';
      scripts.push({ file: `scripts/${f}`, wired: referenced, ageDays, action });
    }
  } catch {}
  return scripts;
}

/** Terminal audit: commands referenced in the dispatcher + docs. */
function terminalAudit() {
  const commands = [];
  try {
    const raw = readFileSync(join(REPO_ROOT, 'services', 'terminal', 'commandDispatcher.mjs'), 'utf8');
    const docs = (() => {
      try {
        const term = readFileSync(join(REPO_ROOT, 'apps', 'web', 'terminal.html'), 'utf8');
        return term.matchAll(/\/([a-z][a-z0-9-]+)/g);
      } catch { return []; }
    })();
    const dispatcherCmds = new Set([...raw.matchAll(/\/([a-z][a-z0-9-]+)/g)].map((m) => m[1]).filter((c) => c.length > 1));
    const uiCmds = new Set([...(docs || [])].map((m) => m[1]).filter((c) => c.length > 1));
    for (const c of dispatcherCmds) {
      commands.push({ command: `/${c}`, inDispatcher: true, inUI: uiCmds.has(c), action: uiCmds.has(c) ? 'KEEP' : 'VERIFY' });
    }
    for (const c of uiCmds) {
      if (!dispatcherCmds.has(c)) commands.push({ command: `/${c}`, inDispatcher: false, inUI: true, action: 'DEAD_OR_UNREGISTERED' });
    }
  } catch {}
  return commands;
}

/** Workflow audit. */
function workflowAudit() {
  const workflows = [];
  try {
    for (const f of readdirSync(join(REPO_ROOT, '.github', 'workflows'))) {
      if (!/\.(yml|yaml)$/.test(f)) continue;
      const name = f.replace(/\.(yml|yaml)$/, '');
      let action = 'KEEP';
      if (['docs.yml'].includes(name)) action = 'MERGE';
      if (name.startsWith('temp') || name.includes('backup')) action = 'REMOVE';
      workflows.push({ file: f, name, action });
    }
  } catch {}
  return workflows;
}

/** Documentation audit: classify by staleness + duplication. */
function documentationAudit() {
  const docs = [];
  try {
    for (const f of readdirSync(REPO_ROOT)) {
      if (!f.endsWith('.md')) continue;
      const stat = statSync(join(REPO_ROOT, f));
      const ageDays = Math.round((Date.now() - stat.mtimeMs) / 86400000);
      let action = 'KEEP';
      if (/FINAL_REVIEW|REPORT|AUDIT|v1\.|v2\.1|_v1|_v2\.2/.test(f)) action = 'ARCHIVE';
      if (/^OPS-|^SESSION_|^DAILY_/.test(f)) action = 'ARCHIVE';
      if (/README|MODEL_CONTRACT|AGENTS|TERMINAL|THINKBOX_SPEC|ENGINEERING_STATE/.test(f)) action = 'CANONICAL';
      docs.push({ file: f, ageDays, sizeKb: Math.round(stat.size / 1024), action });
    }
  } catch {}
  return docs;
}

/** Knowledge audit: duplicate IDs + references. */
function knowledgeAudit() {
  const ids = new Map();
  const refs = new Map();
  const stores = ['knowledge-index.json', 'decision-outcomes.json', 'counterfactuals.json', 'mission-history.json', 'supervisor-history.json'];
  for (const s of stores) {
    try {
      const raw = JSON.parse(readFileSync(join(REPO_ROOT, '.kilo', s), 'utf8'));
      const arr = raw.objects || raw.reviews || raw.records || raw.missions || raw.decisions || [];
      for (const item of arr) {
        const id = item.id || item.reviewId || item.recordId || item.mission || item.decision;
        if (id) ids.set(id, (ids.get(id) || 0) + 1);
        for (const r of item.references || []) refs.set(r, (refs.get(r) || 0) + 1);
      }
    } catch {}
  }
  const duplicates = [...ids].filter(([, n]) => n > 1).map(([id, n]) => ({ id, occurrences: n }));
  return { stores: stores.length, duplicateIds: duplicates, duplicateRefs: [...refs].filter(([, n]) => n > 1).map(([r, n]) => ({ ref: r, occurrences: n })) };
}

const args = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}`) {
  const audits = {
    scriptAudit: scriptAudit(),
    terminalAudit: terminalAudit(),
    workflowAudit: workflowAudit(),
    documentationAudit: documentationAudit(),
    knowledgeAudit: knowledgeAudit(),
  };

  const targets = {
    'script-audit.json': audits.scriptAudit,
    'terminal-audit.json': audits.terminalAudit,
    'workflow-audit.json': audits.workflowAudit,
    'documentation-audit.json': audits.documentationAudit,
    'knowledge-audit.json': audits.knowledgeAudit,
  };

  for (const [file, data] of Object.entries(targets)) {
    writeFileSync(join(OUT_DIR, file), JSON.stringify(data, null, 2), 'utf8');
  }

  const archiveCount = audits.documentationAudit.filter((d) => d.action === 'ARCHIVE').length;
  const canonicalCount = audits.documentationAudit.filter((d) => d.action === 'CANONICAL').length;
  const mergeScripts = audits.scriptAudit.filter((s) => s.action === 'MERGE').length;
  const deadTerminal = audits.terminalAudit.filter((t) => t.action === 'DEAD_OR_UNREGISTERED').length;

  console.log('\n  ┌────────────────────────────────────────────────────┐');
  console.log('  │  STAB-003 — CONSOLIDATION INVENTORY               │');
  console.log('  └────────────────────────────────────────────────────┘');
  console.log(`  Scripts           ${audits.scriptAudit.length} total  (${mergeScripts} mergeable, ${audits.scriptAudit.filter(s=>s.action==='ARCHIVE').length} archive)`);
  console.log(`  Terminal cmds     ${audits.terminalAudit.length} total  (${deadTerminal} unregistered)`);
  console.log(`  Workflows         ${audits.workflowAudit.length} total  (${audits.workflowAudit.filter(w=>w.action!=='KEEP').length} non-keep)`);
  console.log(`  Docs              ${audits.documentationAudit.length} total  (${archiveCount} archive, ${canonicalCount} canonical)`);
  console.log(`  Knowledge         ${audits.knowledgeAudit.duplicateIds.length} duplicate IDs, ${audits.knowledgeAudit.duplicateRefs.length} dup refs`);
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  Deliverables written to benchmarks/:');
  for (const f of Object.keys(targets)) console.log(`    ${f}`);
  console.log('  └────────────────────────────────────────────────────┘\n');
}
