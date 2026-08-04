#!/usr/bin/env node
/**
 * scripts/decision-outcome.mjs — INT-039 Decision Outcome Engine
 * ---------------------------------------------------------------------------
 * Closes the feedback loop: every decision in the ledger receives an
 * immutable outcome review after reality has occurred.
 *
 * Rules:
 *   - Never overwrite a decision. Historical confidence is never modified.
 *   - Reviews are append-only in .kilo/decision-outcomes.json.
 *   - Corrections create a new review record (SUPERSEDED on the old one).
 *   - Confidence calibration is conservative: +2% correct, +1% partial,
 *     -3% wrong, 0% insufficient. Never jump dramatically.
 *
 * Success states: SUCCESS | PARTIAL | FAILED | SUPERSEDED | INSUFFICIENT_DATA
 *
 * Usage:
 *   node scripts/decision-outcome.mjs review DEC-0001 --status SUCCESS \
 *     --expected "precision_delta:0.083,recall_delta:0.250" \
 *     --actual "precision_delta:0.083,recall_delta:0.250" \
 *     --benchmark-runs "RUN-003" --notes "Hypothesis confirmed."
 *   node scripts/decision-outcome.mjs list
 *   node scripts/decision-outcome.mjs show DEC-0001
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LEDGER_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');
const OUTCOMES_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');

mkdirSync(dirname(OUTCOMES_PATH), { recursive: true });

const VALID_STATUSES = ['SUCCESS', 'PARTIAL', 'FAILED', 'SUPERSEDED', 'INSUFFICIENT_DATA'];

// Conservative confidence calibration (INT-039).
const CALIBRATION = {
  SUCCESS: +0.02,
  PARTIAL: +0.01,
  FAILED: -0.03,
  SUPERSEDED: 0,
  INSUFFICIENT_DATA: 0,
};

function loadLedger() {
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    return { decisions: [] };
  }
}

function loadOutcomes() {
  try {
    if (existsSync(OUTCOMES_PATH)) return JSON.parse(readFileSync(OUTCOMES_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), reviews: [] };
}

function saveOutcomes(store) {
  writeFileSync(OUTCOMES_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function nextReviewId(store) {
  const nums = store.reviews.map((r) => Number(r.reviewId.replace('REV-', '')) || 0);
  return `REV-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
}

function parseDeltas(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split(',')) {
    const [k, v] = part.split(':').map((s) => s.trim());
    if (k) out[k] = Number(v);
  }
  return out;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtSign(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

function createReview(opts) {
  const ledger = loadLedger();
  const store = loadOutcomes();

  const decision = ledger.decisions.find((d) => d.id === opts.decision);
  if (!decision) {
    throw new Error(`Decision not found: ${opts.decision}`);
  }
  if (!VALID_STATUSES.includes(opts.status)) {
    throw new Error(`Invalid status ${opts.status}. Allowed: ${VALID_STATUSES.join(', ')}`);
  }

  const expected = parseDeltas(opts.expected);
  const actual = parseDeltas(opts.actual);

  // Confidence calibration — only recorded in the review, never in the decision.
  const confidenceBefore = decision.confidence != null ? decision.confidence / 100 : null;
  const delta = confidenceBefore != null ? CALIBRATION[opts.status] : 0;
  const confidenceAfter = confidenceBefore != null ? Math.round((confidenceBefore + delta) * 100) / 100 : null;

  const review = {
    reviewId: nextReviewId(store),
    decision: opts.decision,
    status: opts.status,
    reviewDate: new Date().toISOString(),
    expected,
    actual,
    confidenceBefore,
    confidenceAfter,
    benchmarkRuns: (opts.benchmarkRuns || '').split(',').map((s) => s.trim()).filter(Boolean),
    notes: opts.notes || '',
    supersedes: opts.supersedes || null,
    calibrationDelta: confidenceBefore != null ? delta : null,
  };

  store.reviews.push(review);
  saveOutcomes(store);
  return { review, decision };
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'review': {
      const decisionId = args[1];
      const flag = (name) => {
        const i = args.indexOf(name);
        return i !== -1 ? args[i + 1] : undefined;
      };
      const status = flag('--status');
      if (!decisionId || !status) {
        console.error('Usage: review <decision-id> --status SUCCESS|PARTIAL|FAILED|SUPERSEDED|INSUFFICIENT_DATA [--expected ...] [--actual ...] [--benchmark-runs ...] [--notes ...]');
        process.exit(1);
      }
      try {
        const { review, decision } = createReview({
          decision: decisionId,
          status,
          expected: flag('--expected'),
          actual: flag('--actual'),
          benchmarkRuns: flag('--benchmark-runs'),
          notes: flag('--notes'),
          supersedes: flag('--supersedes'),
        });

        console.log('\n  ┌─────────────────────────────────────────────────┐');
        console.log('  │  INT-039 — DECISION REVIEW                     │');
        console.log('  └─────────────────────────────────────────────────┘');
        console.log(`  Decision     ${decision.id}`);
        console.log(`  Status       ${review.status}`);
        console.log(`  Prediction   ${decision.problem.slice(0, 60)}`);
        const expP = review.expected.precision_delta;
        const expR = review.expected.recall_delta;
        if (expP != null || expR != null) console.log(`  Expected     precision ${fmtPct(expP)}  recall ${fmtPct(expR)}`);
        const actP = review.actual.precision_delta;
        const actR = review.actual.recall_delta;
        if (actP != null || actR != null) console.log(`  Reality      precision ${fmtSign(actP)}  recall ${fmtSign(actR)}`);
        console.log(`  Confidence   ${review.confidenceBefore != null ? (review.confidenceBefore * 100).toFixed(0) + '%' : '—'} → ${review.confidenceAfter != null ? (review.confidenceAfter * 100).toFixed(0) + '%' : '—'}  (calibration ${review.calibrationDelta != null ? fmtSign(review.calibrationDelta) : 'n/a'})`);
        console.log(`  Benchmarks   ${review.benchmarkRuns.length ? review.benchmarkRuns.join(', ') : '—'}`);
        if (review.notes) console.log(`  Verdict      ${review.notes}`);
        console.log('\n  Immutable — corrections create a new review with --supersedes.\n');
      } catch (e) {
        console.error(`[INT-039] ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const store = loadOutcomes();
      console.log('\n  ╔══════════════════════════════════════════════════╗');
      console.log('  ║  INT-039 — DECISION OUTCOMES                     ║');
      console.log('  ╠══════════════════════════════════════════════════╣');
      for (const r of store.reviews) {
        console.log(`  ║  ${r.reviewId}  ${r.decision}  [${r.status.padEnd(16)}] c ${r.confidenceBefore != null ? (r.confidenceBefore * 100).toFixed(0) + '%→' + (r.confidenceAfter * 100).toFixed(0) + '%' : '—'.padEnd(7)} ${(r.notes || '').slice(0, 22).padEnd(26)}║`);
      }
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      console.log(`  ║  reviews: ${String(store.reviews.length).padEnd(49)}║`);
      console.log('  ╚══════════════════════════════════════════════════╝\n');
      break;
    }

    case 'show': {
      const id = args[1];
      if (!id) { console.error('Usage: show <decision-id>'); process.exit(1); }
      const store = loadOutcomes();
      const reviews = store.reviews.filter((r) => r.decision === id);
      if (reviews.length === 0) { console.error(`No reviews for ${id}`); process.exit(1); }
      for (const r of reviews) {
        console.log(`\n  ${r.reviewId}  (${r.decision})  [${r.status}]`);
        console.log(`  date:        ${r.reviewDate}`);
        console.log(`  expected:    precision ${fmtPct(r.expected.precision_delta)}  recall ${fmtPct(r.expected.recall_delta)}`);
        console.log(`  actual:      precision ${fmtSign(r.actual.precision_delta)}  recall ${fmtSign(r.actual.recall_delta)}`);
        console.log(`  confidence:  ${r.confidenceBefore != null ? (r.confidenceBefore * 100).toFixed(1) + '% → ' + (r.confidenceAfter * 100).toFixed(1) + '%' : '—'}`);
        console.log(`  benchmarks:  ${r.benchmarkRuns.join(', ') || '—'}`);
        if (r.notes) console.log(`  notes:       ${r.notes}`);
        if (r.supersedes) console.log(`  supersedes:  ${r.supersedes}`);
      }
      console.log('');
      break;
    }

    default:
      console.log(`
  INT-039 Decision Outcome Engine

  Commands:
    review <decision-id> --status <state> [flags]
    list
    show <decision-id>

  Flags:
    --expected "precision_delta:0.083,recall_delta:0.250"
    --actual "precision_delta:0.083,recall_delta:0.250"
    --benchmark-runs "RUN-003"
    --notes "Hypothesis confirmed."
    --supersedes REV-0001
`);
      process.exit(1);
  }
}
