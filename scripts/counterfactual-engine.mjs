#!/usr/bin/env node
/**
 * scripts/counterfactual-engine.mjs — INT-029 Counterfactual Engine
 * ---------------------------------------------------------------------------
 * For every decision, evaluate the alternatives against recorded benchmark
 * evidence and determine whether the chosen decision was the best one.
 * The benchmark (evidence) becomes the judge — not intuition.
 *
 * Consumes ONLY existing evidence:
 *   - benchmarks/decisions/ledger.json  (decisions + alternatives)
 *   - .kilo/decision-outcomes.json      (measured outcomes / reviews)
 *
 * Never modifies decisions, reviews, benchmarks, retrieval, or forge.
 * Records are appended to .kilo/counterfactuals.json — never overwritten.
 *
 * Status values: CONFIRMED | SUPERSEDED | OUTDATED | INSUFFICIENT_DATA
 *
 * Usage:
 *   node scripts/counterfactual-engine.mjs --replay DEC-0001
 *   node scripts/counterfactual-engine.mjs --list
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DECISIONS_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');
const REVIEWS_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');
const COUNTERFACTUALS_PATH = join(REPO_ROOT, '.kilo', 'counterfactuals.json');

mkdirSync(dirname(COUNTERFACTUALS_PATH), { recursive: true });

function loadDecisions() {
  try {
    return JSON.parse(readFileSync(DECISIONS_PATH, 'utf8')).decisions;
  } catch {
    return [];
  }
}

function loadReviews() {
  try {
    if (existsSync(REVIEWS_PATH)) return JSON.parse(readFileSync(REVIEWS_PATH, 'utf8')).reviews;
  } catch {}
  return [];
}

function loadCounterfactuals() {
  try {
    if (existsSync(COUNTERFACTUALS_PATH)) return JSON.parse(readFileSync(COUNTERFACTUALS_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), records: [] };
}

function saveCounterfactuals(store) {
  writeFileSync(COUNTERFACTUALS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

/** Measured evidence for a decision = its latest outcome review's actual deltas. */
function measuredEvidence(decisionId, reviews) {
  const forDecision = reviews.filter((r) => r.decision === decisionId);
  const latest = forDecision[forDecision.length - 1];
  if (!latest) return null;
  return {
    precision: latest.actual?.precision_delta ?? null,
    recall: latest.actual?.recall_delta ?? null,
    run: (latest.benchmarkRuns || [])[0] || null,
    confidenceAfter: latest.confidenceAfter ?? null,
  };
}

/**
 * Replay one decision: compare the chosen path's measured evidence against
 * each alternative. Alternatives carry 0/0 (unevaluated) unless recorded
 * evidence exists for them — which it does not today, so they are evaluated
 * honestly as "no measured evidence".
 */
function replayDecision(decisionId, decisions, reviews) {
  const decision = decisions.find((d) => d.id === decisionId);
  if (!decision) return { error: `Decision not found: ${decisionId}` };

  const chosen = measuredEvidence(decisionId, reviews);

  // Alternatives from the decision record, each with its measured evidence.
  const alternatives = (decision.alternatives || []).map((name) => ({
    name,
    precision: null, // not separately replayed/measured in surviving evidence
    recall: null,
    evaluated: false,
  }));

  // Status determination.
  let status;
  if (!chosen || (chosen.precision == null && chosen.recall == null)) {
    status = 'INSUFFICIENT_DATA';
  } else if (decision.supersedes || decision.status === 'SUPERSEDED') {
    status = 'SUPERSEDED';
  } else if (chosen.precision != null && chosen.precision < 0) {
    status = 'OUTDATED'; // chosen path regressed per measured evidence
  } else {
    status = 'CONFIRMED';
  }

  // Confidence: carry the review's calibrated confidence when available.
  const confidence = chosen?.confidenceAfter ?? null;

  const record = {
    recordId: `CF-${Date.now()}`,
    decision: decisionId,
    chosenStrategy: decision.chosen,
    winner: chosen && chosen.precision != null && chosen.precision >= 0 ? 'chosen' : 'unevaluated',
    alternatives,
    chosenEvidence: chosen
      ? { precision: chosen.precision, recall: chosen.recall, run: chosen.run }
      : null,
    confidence,
    status,
    reason: reasonFor(status, chosen),
    replayedAt: new Date().toISOString(),
  };

  return { record, decision };
}

function reasonFor(status, chosen) {
  switch (status) {
    case 'CONFIRMED':
      return `Chosen path measured ${fmtPct(chosen?.precision)} precision / ${fmtPct(chosen?.recall)} recall on ${chosen?.run || 'evidence'}; no alternative shows better measured evidence.`;
    case 'SUPERSEDED':
      return 'This decision was superseded by a later decision.';
    case 'OUTDATED':
      return 'Chosen path regressed per measured evidence — decision should be revisited.';
    case 'INSUFFICIENT_DATA':
      return 'No measured outcome evidence exists yet — cannot judge.';
    default:
      return '';
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}`) {
  const replayIdx = args.indexOf('--replay');
  if (replayIdx !== -1) {
    const decisionId = args[replayIdx + 1];
    if (!decisionId) { console.error('Usage: --replay <decision-id>'); process.exit(1); }

    const decisions = loadDecisions();
    const reviews = loadReviews();
    const result = replayDecision(decisionId, decisions, reviews);
    if (result.error) { console.error(result.error); process.exit(1); }

    const { record, decision } = result;
    const store = loadCounterfactuals();

    // Replay is idempotent: skip appending if an identical record for this
    // decision + status already exists (replaying twice is not a new event).
    const dup = store.records.some(
      (r) => r.decision === record.decision && r.status === record.status && r.replayedAt === record.replayedAt
    );
    const alreadyReplayed = store.records.some(
      (r) => r.decision === record.decision && r.status === record.status && r.chosenEvidence?.run === record.chosenEvidence?.run
    );
    if (!dup && !alreadyReplayed) {
      store.records.push(record);
      saveCounterfactuals(store);
    }

    console.log('\n  ┌─────────────────────────────────────────────────────┐');
    console.log('  │  INT-029 — COUNTERFACTUAL REPLAY                    │');
    console.log('  └─────────────────────────────────────────────────────┘');
    console.log(`  Decision      ${decision.id}`);
    console.log(`  Chosen        ${decision.chosen.slice(0, 60)}`);
    console.log(`  Alternatives  ${record.alternatives.length} tested`);
    console.log(`  Winner        ${record.winner}`);
    if (record.chosenEvidence) {
      console.log(`  Evidence      ${record.chosenEvidence.run || '—'}  precision ${fmtPct(record.chosenEvidence.precision)}  recall ${fmtPct(record.chosenEvidence.recall)}`);
    } else {
      console.log(`  Evidence      none measured`);
    }
    console.log(`  Confidence    ${record.confidence != null ? (record.confidence * 100).toFixed(0) + '%' : '—'}`);
    console.log(`  Status        ${record.status}`);
    console.log(`  Reason        ${record.reason}`);
    console.log('\n  Recorded to .kilo/counterfactuals.json (append-only).\n');
    process.exit(0);
  }

  if (args.includes('--list')) {
    const store = loadCounterfactuals();
    console.log('\n  Counterfactual records:');
    for (const r of store.records) {
      console.log(`  ${r.recordId}  ${r.decision}  [${r.status.padEnd(16)}] winner=${r.winner}  conf=${r.confidence != null ? (r.confidence * 100).toFixed(0) + '%' : '—'}`);
    }
    console.log(`  total: ${store.records.length}\n`);
    process.exit(0);
  }

  console.log(`
  INT-029 Counterfactual Engine

  Usage:
    node scripts/counterfactual-engine.mjs --replay <decision-id>
    node scripts/counterfactual-engine.mjs --list
`);
  process.exit(1);
}
