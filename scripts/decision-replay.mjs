#!/usr/bin/env node
/**
 * scripts/decision-replay.mjs — INT-029 Decision Replay CLI
 * ---------------------------------------------------------------------------
 * Replays a decision through the counterfactual engine and answers the five
 * replay questions:
 *   1. Would we make the same decision today?
 *   2. Did benchmark evidence change?
 *   3. Did confidence change?
 *   4. Did a better alternative emerge?
 *   5. Should this decision be superseded?
 *
 * Consumes only the counterfactual engine — no new intelligence.
 *
 * Usage:
 *   npm run intelligence:replay DEC-0001
 *   npm run intelligence:replay all
 * ---------------------------------------------------------------------------
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ENGINE = join(__dirname, 'counterfactual-engine.mjs');

function loadDecisions() {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json'), 'utf8')).decisions;
  } catch {
    return [];
  }
}

function loadCounterfactuals() {
  try {
    const p = join(REPO_ROOT, '.kilo', 'counterfactuals.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')).records;
  } catch {}
  return [];
}

function runEngine(decisionId) {
  const res = spawnSync(process.execPath, [ENGINE, '--replay', decisionId], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return { out: res.stdout || '', err: res.stderr || '' };
}

function answerQuestions(decisionId, cf) {
  const record = cf.find((r) => r.decision === decisionId && r.status === 'CONFIRMED');
  const status = record?.status || 'INSUFFICIENT_DATA';
  const chosenOK = status === 'CONFIRMED';

  console.log('\n  Replay Questions:');
  console.log(`  1. Same decision today?      ${chosenOK ? 'YES — evidence supports it' : 'CANNOT CONFIRM — insufficient evidence'}`);
  console.log(`  2. Benchmark evidence changed? ${record?.chosenEvidence?.run ? `Measured on ${record.chosenEvidence.run}` : 'No measured evidence recorded'}`);
  console.log(`  3. Confidence changed?        ${record?.confidence != null ? (record.confidence * 100).toFixed(0) + '% post-replay' : 'not recorded'}`);
  console.log(`  4. Better alternative?        ${record?.winner === 'chosen' ? 'NO — chosen path wins' : 'UNEVALUATED — alternatives had no measured evidence'}`);
  console.log(`  5. Supersede?                 ${status === 'SUPERSEDED' ? 'YES' : status === 'OUTDATED' ? 'YES — revisit' : 'NO'}`);
}

const args = process.argv.slice(2);
const target = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!target) {
    console.error('Usage: npm run intelligence:replay <decision-id | all>');
    process.exit(1);
  }

  if (target === 'all') {
    const decisions = loadDecisions();
    console.log(`\n  Replaying ${decisions.length} decisions through the counterfactual engine...`);
    for (const d of decisions) {
      const { out, err } = runEngine(d.id);
      if (err) console.error(err);
      const ok = out.includes('Recorded to') || out.includes('replayed');
      console.log(`  ${ok ? '✓' : '✗'} ${d.id} replayed`);
    }
    const cf = loadCounterfactuals();
    console.log(`\n  Counterfactual records: ${cf.length}`);
    for (const r of cf) {
      console.log(`  ${r.decision.padEnd(10)} [${r.status.padEnd(18)}] winner=${r.winner.padEnd(12)} conf=${r.confidence != null ? (r.confidence * 100).toFixed(0) + '%' : '—'}`);
    }
    process.exit(0);
  }

  // Single decision replay.
  const { out, err } = runEngine(target);
  if (err) console.error(err);
  process.stdout.write(out);

  const cf = loadCounterfactuals();
  answerQuestions(target, cf);
  process.exit(0);
}
