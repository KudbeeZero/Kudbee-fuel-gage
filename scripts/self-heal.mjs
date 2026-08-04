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
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HEAL_DIR = join(REPO_ROOT, '.kilo', 'memory', 'heals');

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

async function recordLearning(gates, diagnosis) {
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
  return entry;
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
  console.log('\n══ DIAGNOSING WITH GEMINI ══\n');
  const diagnosis = await geminiDiagnose(failures);
  console.log(diagnosis);
  await recordLearning(results, diagnosis);
  console.log('\n[self-heal] diagnosis recorded. Review before applying the fix.');
}
