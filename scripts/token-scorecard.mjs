#!/usr/bin/env node
/**
 * scripts/token-scorecard.mjs — THINK Token Recommendation Scorecard
 * ---------------------------------------------------------------------------
 * Level 2 validation: does a forged optimization token produce recommendations
 * an experienced engineer would agree with?
 *
 * Scores each Gemini-forged token against the forge corpus:
 *   - promotions: tokens referenced must exist in the forge with high kd
 *   - prunes:     tokens referenced must exist with low kd / CHALLENGED status
 *   - parameters: alpha/beta/threshold adjustments must stay within sane bounds
 *
 * Writes a durable scorecard entry to .kilo/memory/forge/scorecards/ and a
 * running KPI ledger. Never blocks the training loop — it is advisory.
 *
 * Usage:
 *   node scripts/token-scorecard.mjs            # score all unscored forged tokens
 *   node scripts/token-scorecard.mjs --latest   # score just the newest
 *   node scripts/token-scorecard.mjs --kpi      # print the learning KPI ledger
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FORGE_DIR = join(REPO_ROOT, '.kilo', 'memory', 'forge');
const SCORECARD_DIR = join(FORGE_DIR, 'scorecards');
const KPI_LEDGER_PATH = join(FORGE_DIR, 'kpi-ledger.json');

mkdirSync(SCORECARD_DIR, { recursive: true });

// ─── Forge corpus index ───────────────────────────────────────────────────

function loadCorpus() {
  const tokens = [];
  if (!existsSync(FORGE_DIR)) return tokens;
  for (const f of readdirSync(FORGE_DIR).filter((x) => x.startsWith('think-') && x.endsWith('.json'))) {
    try {
      tokens.push(JSON.parse(readFileSync(join(FORGE_DIR, f), 'utf8')));
    } catch {}
  }
  return tokens;
}

function indexById(corpus) {
  const byId = new Map();
  for (const t of corpus) {
    if (t.traceId) byId.set(t.traceId, t);
    if (t.id) byId.set(t.id, t);
  }
  return byId;
}

// ─── Scoring ─────────────────────────────────────────────────────────────

function scoreToken(token, corpus, byId) {
  const issues = [];
  const checks = {};

  // 1. Promotion sanity: referenced token exists and has decent kd
  const promotions = token.suggestedPromotions || [];
  checks.promotions = promotions.length;
  let promotionHits = 0;
  for (const p of promotions) {
    const target = byId.get(p);
    if (!target) {
      issues.push(`promotion "${p}" references a token that does not exist in the forge`);
    } else if ((target.kd ?? target.kd_score ?? 0) >= 60) {
      promotionHits += 1;
    } else {
      issues.push(`promotion "${p}" has low kd (${target.kd}) — unlikely a high-value recommendation`);
    }
  }

  // 2. Prune sanity: referenced token exists and has low kd / challenged
  const prunes = token.suggestedPrunes || [];
  checks.prunes = prunes.length;
  let pruneHits = 0;
  for (const p of prunes) {
    const target = byId.get(p);
    if (!target) {
      issues.push(`prune "${p}" references a token that does not exist in the forge`);
    } else if ((target.kd ?? 0) < 60 || target.status === 'CHALLENGED') {
      pruneHits += 1;
    } else {
      issues.push(`prune "${p}" has high kd (${target.kd}) — pruning verified knowledge is risky`);
    }
  }

  // 3. Parameter bounds: alpha/beta/threshold must stay conservative
  const alpha = Number(token.alphaAdjustment ?? 0);
  const beta = Number(token.betaAdjustment ?? 0);
  const threshold = Number(token.thresholdAdjustment ?? 0);
  if (!Number.isFinite(alpha) || Math.abs(alpha) > 10) issues.push(`alpha adjustment ${alpha} out of conservative bounds`);
  if (!Number.isFinite(beta) || Math.abs(beta) > 10) issues.push(`beta adjustment ${beta} out of conservative bounds`);
  if (!Number.isFinite(threshold) || Math.abs(threshold) > 0.5) issues.push(`threshold adjustment ${threshold} out of conservative bounds`);
  checks.alpha = alpha;
  checks.beta = beta;
  checks.threshold = threshold;

  // 4. Reasoning present and substantive
  const reasoning = (token.reasoning || '').trim();
  checks.reasoningWords = reasoning.split(/\s+/).filter(Boolean).length;
  if (reasoning.length < 20) issues.push('reasoning is missing or too thin to trust');

  // Composite score: start at 1.0, subtract for each issue
  const score = Math.max(0, Math.round((1 - issues.length * 0.2) * 100) / 100);
  const verdict = score >= 0.8 ? 'PASS' : score >= 0.5 ? 'REVIEW' : 'REJECT';

  return {
    tokenId: token.traceId || `unknown-${Date.now()}`,
    forgedAt: token.createdAt || new Date().toISOString(),
    checks,
    promotionHitRate: promotions.length ? promotionHits / promotions.length : 1,
    pruneHitRate: prunes.length ? pruneHits / prunes.length : 1,
    issues,
    score,
    verdict,
  };
}

// ─── KPI ledger ──────────────────────────────────────────────────────────

function loadLedger() {
  try {
    if (existsSync(KPI_LEDGER_PATH)) return JSON.parse(readFileSync(KPI_LEDGER_PATH, 'utf8'));
  } catch {}
  return { version: 1, updatedAt: null, scorecards: [], kpis: [] };
}

function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  writeFileSync(KPI_LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
}

function aggregateKpis(ledger) {
  const cards = ledger.scorecards;
  const passCount = cards.filter((c) => c.verdict === 'PASS').length;
  const reviewCount = cards.filter((c) => c.verdict === 'REVIEW').length;
  const rejectCount = cards.filter((c) => c.verdict === 'REJECT').length;
  const promotionRate = cards.length
    ? cards.reduce((s, c) => s + c.promotionHitRate, 0) / cards.length
    : 0;
  const pruneRate = cards.length
    ? cards.reduce((s, c) => s + c.pruneHitRate, 0) / cards.length
    : 0;

  const kpis = {
    generatedAt: new Date().toISOString(),
    forgedTokensScored: cards.length,
    promotionAcceptanceRate: Math.round(promotionRate * 10000) / 100,
    prunePrecision: Math.round(pruneRate * 10000) / 100,
    passRate: cards.length ? Math.round((passCount / cards.length) * 10000) / 100 : 0,
    passCount,
    reviewCount,
    rejectCount,
    averageScore: cards.length
      ? Math.round((cards.reduce((s, c) => s + c.score, 0) / cards.length) * 100) / 100
      : 0,
  };
  ledger.kpis = kpis;
  return kpis;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === '--kpi' || cmd === 'kpi') {
    const ledger = loadLedger();
    const kpis = aggregateKpis(ledger);
    console.log('\n  ╔══════════════════════════════════════════════╗');
    console.log('  ║  THINK TOKEN LEARNING KPIs                   ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  forged tokens scored:  ${String(kpis.forgedTokensScored).padEnd(22)}║`);
    console.log(`  ║  promotion acceptance:  ${String(kpis.promotionAcceptanceRate + '%').padEnd(22)}║`);
    console.log(`  ║  prune precision:       ${String(kpis.prunePrecision + '%').padEnd(22)}║`);
    console.log(`  ║  overall pass rate:     ${String(kpis.passRate + '%').padEnd(22)}║`);
    console.log(`  ║  avg recommendation:    ${String(kpis.averageScore + '/1.0').padEnd(22)}║`);
    console.log(`  ║  pass/review/reject:    ${String(`${kpis.passCount}/${kpis.reviewCount}/${kpis.rejectCount}`).padEnd(22)}║`);
    console.log('  ╚══════════════════════════════════════════════╝\n');
    saveLedger(ledger);
    process.exit(0);
  }

  // Score forged tokens
  const corpus = loadCorpus();
  const byId = indexById(corpus);
  const geminiTokens = corpus.filter((t) => t.traceId?.startsWith('gemini-analysis-'));

  const ledger = loadLedger();
  const alreadyScored = new Set(ledger.scorecards.map((c) => c.tokenId));
  const target = cmd === '--latest' ? geminiTokens.slice(-1) : geminiTokens;

  let newCards = 0;
  for (const t of target) {
    if (alreadyScored.has(t.traceId)) continue;
    const card = scoreToken(t, corpus, byId);
    ledger.scorecards.push(card);
    writeFileSync(join(SCORECARD_DIR, `${card.tokenId}.json`), JSON.stringify(card, null, 2), 'utf8');
    newCards += 1;
    const mark = card.verdict === 'PASS' ? '✅' : card.verdict === 'REVIEW' ? '⚠️' : '❌';
    console.log(`[SCORECARD] ${mark} ${card.tokenId} → ${card.verdict} (score ${card.score})`);
    for (const issue of card.issues) console.log(`             • ${issue}`);
  }

  if (newCards === 0 && target.length > 0) {
    console.log('[SCORECARD] All Gemini tokens already scored.');
  }

  aggregateKpis(ledger);
  saveLedger(ledger);
  console.log(`\n[SCORECARD] ${newCards} new scorecards written. KPI ledger updated.`);
  console.log(`[SCORECARD] Run "node scripts/token-scorecard.mjs --kpi" to view the KPI dashboard.`);
}
