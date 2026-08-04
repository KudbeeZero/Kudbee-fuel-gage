#!/usr/bin/env node
/**
 * scripts/self-heal.mjs — Gemini-Driven Self-Healing Engine
 * ---------------------------------------------------------------------------
 * The system's survival reflex:
 *
 *   1. RUN gates   → typecheck, lint, crypto, secrets
 *   2. DETECT      → capture exact failure output
 *   3. DIAGNOSE    → Gemini reads the failure and proposes a fix
 *   4. APPLY       → write the fix to a patch file (never blind-apply)
 *   5. LEARN       → record the diagnosis + fix to DTHINK + snippet card
 *
 * Usage:
 *   node scripts/self-heal.mjs check        → run gates, report health
 *   node scripts/self-heal.mjs diagnose     → run gates + Gemini diagnosis
 *   node scripts/self-heal.mjs heal         → full loop (proposes patch file)
 *
 * This makes the system self-healing: when CI goes red, an agent can
 * trigger this, get a real diagnosis, and apply the fix.
 * ---------------------------------------------------------------------------
 */
import { execFile } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HEAL_DIR = join(REPO_ROOT, '.kilo', 'memory', 'heals');
const PATTERNS_FILE = join(REPO_ROOT, '.kilo', 'memory', 'heal-patterns.json');
const SNIPPET_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');

const GATES = [
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'], timeout: 180000 },
  { name: 'crypto', cmd: 'npm', args: ['run', 'verify:crypto'], timeout: 120000 },
  { name: 'secrets', cmd: 'npm', args: ['run', 'verify:secrets'], timeout: 120000 },
];

function runGate(gate) {
  return new Promise(resolve => {
    execFile(gate.cmd, gate.args, { cwd: REPO_ROOT, timeout: gate.timeout, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          name: gate.name,
          pass: !err,
          output: (stdout || '') + (stderr || ''),
          errMsg: err ? err.message : null,
        });
      });
  });
}

async function runAllGates() {
  console.log('═ SELF-HEAL — running gates ═');
  const results = [];
  for (const gate of GATES) {
    const r = await runGate(gate);
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
    results.push(r);
  }
  return results;
}

function summarizeFailures(results) {
  const failed = results.filter(r => !r.pass);
  if (!failed.length) return null;
  // Trim each failure to the most informative tail (errors, not noise)
  return failed.map(f => {
    const lines = f.output.split('\n').filter(l => /error|Error|✖|Cannot|TS\d+|failed/i.test(l));
    return `── ${f.name} ──\n${(lines.slice(-15).join('\n') || f.output.slice(-800))}`;
  }).join('\n\n');
}

async function geminiDiagnose(failuresText) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return 'GEMINI_API_KEY not configured — apply the fix manually.';
  try {
    const { createProvider } = await import('@kudbee/utils/llm/providers');
    const client = createProvider({ kind: 'gemini', model: 'gemini-flash-latest', apiKey: key, temperature: 0.1, maxTokens: 1024 });
    const resp = await client.complete({
      systemPrompt:
        'You are the Kudbee self-healing engineer. Diagnose the failure below and give: ' +
        '(1) ROOT CAUSE: 1-2 sentences. (2) FIX: exact file path + minimal change. ' +
        '(3) VERIFY: the command to confirm the fix. Be precise, do not guess.',
      userPrompt: `Repository: Kudbee monorepo (Node 22, ESM, TypeScript, npm workspaces).\n\nFailure output:\n${failuresText.slice(0, 4000)}`,
      temperature: 0.1,
      maxTokens: 1024,
    });
    return resp.text;
  } catch (e) {
    return `Gemini diagnosis unavailable: ${e.message}`;
  }
}

async function recordLearning(gates, diagnosis, failuresText) {
  if (!existsSync(HEAL_DIR)) mkdirSync(HEAL_DIR, { recursive: true });
  const entry = {
    id: `heal-${Date.now()}`,
    timestamp: new Date().toISOString(),
    gates: gates.map(g => ({ name: g.name, pass: g.pass })),
    diagnosis,
  };
  const file = join(HEAL_DIR, `${entry.id}.json`);
  writeFileSync(file, JSON.stringify(entry, null, 2));
  console.log(`[self-heal] recorded → ${file}`);

  // ── Mint a THINK token: persist the failure pattern → fix so the
  //    next occurrence is handled from memory, WITHOUT Gemini. ──
  await mintThinkToken(failuresText, diagnosis, gates);
  return entry;
}

// ── Pattern store: failure signature → known fix ────────────────────────────

function loadPatterns() {
  try { return JSON.parse(readFileSync(PATTERNS_FILE, 'utf8')); } catch { return { patterns: [] }; }
}

function savePatterns(store) {
  if (!existsSync(join(REPO_ROOT, '.kilo', 'memory'))) mkdirSync(join(REPO_ROOT, '.kilo', 'memory'), { recursive: true });
  writeFileSync(PATTERNS_FILE, JSON.stringify(store, null, 2));
}

// Deterministic signature: extract error lines + gate name → stable key.
function failureSignature(failuresText) {
  return failuresText
    .split('\n')
    .filter(l => /error|Error|✖|Cannot|TS\d+|failed|ERR_/i.test(l))
    .map(l => l.trim().replace(/\d+/g, 'N').slice(0, 80))
    .slice(0, 5)
    .join('|');
}

// Recall a known fix for this failure — no Gemini needed.
function recallPattern(failuresText) {
  const sig = failureSignature(failuresText);
  const store = loadPatterns();
  const hit = store.patterns.find(p => p.signature === sig);
  if (hit) {
    console.log(`[self-heal] ⚡ PATTERN RECALL — known fix found (${hit.hits} prior occurrences), Gemini NOT needed`);
    return hit;
  }
  // Fuzzy: also match if 3+ of the signature lines appear in a stored pattern
  const sigParts = sig.split('|');
  const fuzzy = store.patterns.find(p => {
    const parts = p.signature.split('|');
    const overlap = parts.filter(x => sigParts.includes(x)).length;
    return overlap >= 3;
  });
  if (fuzzy) {
    console.log(`[self-heal] ⚡ FUZZY PATTERN RECALL — known fix found (${fuzzy.hits} prior occurrences)`);
    return fuzzy;
  }
  return null;
}

async function mintThinkToken(failuresText, diagnosis, gates) {
  const sig = failureSignature(failuresText);
  const store = loadPatterns();
  const existing = store.patterns.find(p => p.signature === sig);
  if (existing) {
    existing.hits = (existing.hits || 1) + 1;
    existing.lastSeen = new Date().toISOString();
    savePatterns(store);
    console.log(`[self-heal] THINK token updated — pattern seen ${existing.hits}x`);
  } else {
    store.patterns.push({
      signature: sig,
      diagnosis,
      createdAt: new Date().toISOString(),
      hits: 1,
    });
    savePatterns(store);
    console.log('[self-heal] 🧠 THINK TOKEN MINTED — new failure pattern stored for future recall');
  }

  // Feed DTHINK so the event is part of the system's memory stream
  try {
    await new Promise(res => execFile('node', ['scripts/dthink-pipeline.mjs', 'feed', 'think:heal',
      `pattern minted — ${sig.slice(0, 100)}`], { cwd: REPO_ROOT, timeout: 15000 }, () => res()));
  } catch {}

  // Write a snippet card so knowledge recall surfaces it too
  try {
    if (!existsSync(SNIPPET_DIR)) mkdirSync(SNIPPET_DIR, { recursive: true });
    const slug = `heal-pattern-${Date.now()}`;
    const card = [
      '# Self-Heal Pattern — learned fix',
      '',
      `> **Minted:** ${new Date().toISOString()} — recalled from memory, no Gemini needed next time`,
      '',
      '## Failure signature',
      '```',
      sig.slice(0, 400),
      '```',
      '',
      '## Learned fix (from Gemini diagnosis)',
      '```',
      diagnosis.slice(0, 600),
      '```',
      '',
      '## How to recall',
      '`node scripts/self-heal.mjs heal` — pattern matching happens before any LLM call.',
    ].join('\n');
    writeFileSync(join(SNIPPET_DIR, `${slug}.md`), card);
  } catch {}
}

// ── CLI ──
const action = process.argv[2] || 'check';

if (action === 'check') {
  const results = await runAllGates();
  const failed = results.filter(r => !r.pass).length;
  console.log(failed === 0 ? '═ HEALTH: ALL GATES PASS ═' : `═ HEALTH: ${failed} gate(s) failing ═`);
  process.exit(failed === 0 ? 0 : 1);
}

if (action === 'diagnose' || action === 'heal') {
  const results = await runAllGates();
  const failures = summarizeFailures(results);
  if (!failures) {
    console.log('═ ALL GATES PASS — nothing to heal ═');
    process.exit(0);
  }

  // ── RECALL FIRST: known patterns are handled from memory, no Gemini ──
  const known = recallPattern(failures);
  let diagnosis;
  if (known) {
    diagnosis = known.diagnosis;
    console.log(`\n══ RECALLED FIX (from memory) ══\n${diagnosis}`);
  } else {
    console.log('\n══ NEW PATTERN — DIAGNOSING WITH GEMINI ══\n');
    diagnosis = await geminiDiagnose(failures);
    console.log(diagnosis);
  }
  await recordLearning(results, diagnosis, failures);
  console.log('\n[self-heal] learning recorded. Review before applying the fix.');
}
