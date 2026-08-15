#!/usr/bin/env node
/**
 * scripts/knowledge-audit.mjs — INT-040 Knowledge Audit
 * ---------------------------------------------------------------------------
 * Scans all durable knowledge objects and detects governance failures:
 *   - Missing owner
 *   - Missing evidence
 *   - Duplicate IDs
 *   - Broken references
 *   - Expired review dates (past review_after while ACTIVE)
 *   - Superseded knowledge still ACTIVE
 *   - Orphan benchmarks (no object registered for them)
 *   - Skills with no supporting evidence
 *
 * Reads:
 *   - .kilo/knowledge-index.json      (lifecycle index)
 *   - benchmarks/decisions/ledger.json
 *   - .kilo/decision-outcomes.json
 *   - .kilo/counterfactuals.json
 *   - .kilo/memory/forge/             (THINK tokens)
 *
 * Never modifies anything. Report only.
 *
 * Usage: npm run knowledge:audit
 * ---------------------------------------------------------------------------
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INDEX_PATH = join(REPO_ROOT, '.kilo', 'knowledge-index.json');
const DECISIONS_PATH = join(REPO_ROOT, 'benchmarks', 'decisions', 'ledger.json');
const REVIEWS_PATH = join(REPO_ROOT, '.kilo', 'decision-outcomes.json');
const COUNTER_PATH = join(REPO_ROOT, '.kilo', 'counterfactuals.json');
const FORGE_DIR = join(REPO_ROOT, '.kilo', 'memory', 'forge');

function loadJson(p) {
  try {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function audit() {
  const index = loadJson(INDEX_PATH) || { objects: [], transitions: [] };
  const decisions = (loadJson(DECISIONS_PATH) || { decisions: [] }).decisions;
  const reviews = (loadJson(REVIEWS_PATH) || { reviews: [] }).reviews;
  const counterfactuals = (loadJson(COUNTER_PATH) || { records: [] }).records;

  const forgeTokens = [];
  try {
    if (existsSync(FORGE_DIR)) {
      for (const f of readdirSync(FORGE_DIR).filter((x) => x.startsWith('think-') && x.endsWith('.json'))) {
        try { forgeTokens.push(JSON.parse(readFileSync(join(FORGE_DIR, f), 'utf8'))); } catch {}
      }
    }
  } catch {}

  const findings = { missingOwner: [], missingEvidence: [], duplicateIds: [], brokenRefs: [], expiredReviews: [], supersededActive: [], orphanBenchmarks: [], skillNoEvidence: [] };

  // Known-good ids across all stores (for broken-reference detection).
  const knownIds = new Set([
    ...index.objects.map((o) => o.id),
    ...decisions.map((d) => d.id),
    ...reviews.map((r) => r.reviewId),
    ...counterfactuals.map((c) => c.recordId),
    ...forgeTokens.map((t) => t.traceId || t.id).filter(Boolean),
  ]);

  // Duplicate IDs across all objects.
  const idCounts = new Map();
  for (const id of knownIds) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  for (const [id, n] of idCounts) if (n > 1) findings.duplicateIds.push(id);

  // Lifecycle index checks.
  for (const o of index.objects) {
    if (!o.owner) findings.missingOwner.push(o.id);
    if (!o.evidence && o.type !== 'bootstrap') findings.missingEvidence.push(o.id);
    if (o.status === 'ACTIVE' && o.review_after && o.review_after < today()) findings.expiredReviews.push(o.id);
    if (o.status === 'SUPERSEDED' || o.superseded_by) {
      if (o.status === 'ACTIVE') findings.supersededActive.push(o.id);
    }
    for (const ref of o.references) {
      if (!knownIds.has(ref) && !ref.startsWith('BMK-') && !ref.startsWith('DEC-')) {
        // Benchmarks may not be registered — only flag fully unknown refs.
        findings.brokenRefs.push(`${o.id}→${ref}`);
      }
    }
  }

  // Orphan benchmarks: draft/registered benchmark objects without a lifecycle record.
  const benchmarkIds = index.objects.filter((o) => o.type === 'benchmark').map((o) => o.id);
  const draftFiles = [];
  try {
    const dir = join(REPO_ROOT, 'benchmarks', 'drafts');
    if (existsSync(dir)) draftFiles.push(...readdirSync(dir).filter((f) => f.endsWith('.json')));
  } catch {}
  for (const f of draftFiles) {
    const draftId = f.replace('.json', '');
    if (!benchmarkIds.includes(draftId)) findings.orphanBenchmarks.push(draftId);
  }

  // Skills with no supporting evidence.
  for (const o of index.objects.filter((x) => x.type === 'skill')) {
    if (!o.evidence && o.references.length === 0) findings.skillNoEvidence.push(o.id);
  }

  return {
    counts: {
      thinkTokens: forgeTokens.length,
      decisions: decisions.length,
      reviews: reviews.length,
      counterfactuals: counterfactuals.length,
      lifecycleObjects: index.objects.length,
    },
    byStatus: index.objects.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {}),
    findings,
  };
}

function report(result) {
  const { counts, byStatus, findings } = result;
  const totalFindings = Object.values(findings).reduce((s, arr) => s + arr.length, 0);

  console.log('\n  ┌──────────────────────────────────────────────────┐');
  console.log('  │  INT-040 — KNOWLEDGE AUDIT                       │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  THINK tokens        ${String(counts.thinkTokens).padEnd(14)} ACTIVE/VERIFIED ${byStatus.ACTIVE || 0}`);
  console.log(`  Decisions           ${String(counts.decisions).padEnd(14)} lifecycle objects ${counts.lifecycleObjects}`);
  console.log(`  Reviews             ${String(counts.reviews).padEnd(14)} transitions recorded`);
  console.log(`  Counterfactuals     ${String(counts.counterfactuals).padEnd(14)}`);
  console.log('  ────────────────────────────────────────────────────');
  console.log(`  Missing owner       ${findings.missingOwner.length}`);
  console.log(`  Missing evidence    ${findings.missingEvidence.length}`);
  console.log(`  Duplicate IDs       ${findings.duplicateIds.length}`);
  console.log(`  Broken references   ${findings.brokenRefs.length}`);
  console.log(`  Expired reviews     ${findings.expiredReviews.length}`);
  console.log(`  Superseded+ACTIVE   ${findings.supersededActive.length}`);
  console.log(`  Orphan benchmarks   ${findings.orphanBenchmarks.length}`);
  console.log(`  Skills no evidence  ${findings.skillNoEvidence.length}`);
  console.log('  ────────────────────────────────────────────────────');
  const verdict = totalFindings === 0 ? 'PASS' : totalFindings <= 3 ? 'WARN' : 'FAIL';
  console.log(`  Result              ${verdict}`);
  console.log('  └──────────────────────────────────────────────────┘\n');

  for (const [key, list] of Object.entries(findings)) {
    if (list.length) console.log(`  ${key}: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '...' : ''}`);
  }
  console.log('');
  return { totalFindings, verdict };
}

// Cross-platform entry-point guard (Windows path separators differ from
// import.meta.url's forward slashes, so a raw === comparison silently no-ops).
if (process.argv[1] && import.meta.url.endsWith('/' + process.argv[1].split(/[\\/]/).pop())) {
  const r = audit();
  const summary = report(r);
  // Default: fail only on FAIL. With --strict, also fail on WARN findings.
  const strict = process.argv.includes('--strict');
  process.exitCode = summary.verdict === 'FAIL' || (strict && summary.verdict === 'WARN') ? 1 : 0;
}
