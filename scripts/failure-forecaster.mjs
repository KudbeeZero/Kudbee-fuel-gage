#!/usr/bin/env node
/**
 * scripts/failure-forecaster.mjs — The Failure Forecaster
 * ---------------------------------------------------------------------------
 * INVENTION #10: Reads the self-heal pattern store and predicts which gate
 * will fail NEXT based on trend lines — then recommends a proactive fix
 * BEFORE CI goes red.
 *
 *   failure-forecaster.mjs          → forecast + report
 *   failure-forecaster.mjs --json   → machine-readable output
 *
 * Predict-and-prevent instead of detect-and-repair.
 * ---------------------------------------------------------------------------
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PATTERNS_FILE = join(REPO_ROOT, '.kilo', 'memory', 'heal-patterns.json');
const ECHO_LOG = join(REPO_ROOT, '.kilo', 'memory', 'echo', 'echo-log.jsonl');

function loadPatterns() {
  try { return JSON.parse(readFileSync(PATTERNS_FILE, 'utf8')); } catch { return { patterns: [] }; }
}

function loadEchoStats() {
  if (!existsSync(ECHO_LOG)) return null;
  try {
    const lines = readFileSync(ECHO_LOG, 'utf8').split('\n').filter(Boolean);
    const byKind = {};
    for (const line of lines.slice(-200)) {
      try {
        const e = JSON.parse(line);
        const k = e.kind || 'ask';
        byKind[k] = byKind[k] || { count: 0, success: 0, latencySum: 0 };
        byKind[k].count++;
        if (e.outcome === 'success') byKind[k].success++;
        byKind[k].latencySum += e.latency || 0;
      } catch {}
    }
    return byKind;
  } catch { return null; }
}

// Risk model: a gate's risk = (pattern hits for its signature) × recency weight
function forecast() {
  const store = loadPatterns();
  const echo = loadEchoStats();
  const now = Date.now();

  // Group patterns by inferred gate (first error token in signature)
  const byGate = {};
  for (const p of store.patterns || []) {
    const gate = inferGate(p.signature);
    const ageDays = p.lastSeen ? (now - new Date(p.lastSeen).getTime()) / 86400000 : 30;
    const recency = Math.max(0, 1 - ageDays / 30);
    byGate[gate] = byGate[gate] || { hits: 0, lastSeen: null, signatures: [] };
    byGate[gate].hits += p.hits || 1;
    byGate[gate].signatures.push(p.signature.slice(0, 60));
    if (ageDays < 7) byGate[gate].recent = (byGate[gate].recent || 0) + (p.hits || 1);
  }

  const gates = Object.entries(byGate).map(([gate, g]) => ({
    gate,
    hits: g.hits,
    recentHits: g.recent || 0,
    risk: Math.min(100, Math.round(((g.recent || 0) / Math.max(1, g.hits)) * 60 + Math.min(40, (g.recent || 0) * 8))),
    examples: g.signatures.slice(0, 2),
  })).sort((a, b) => b.risk - a.risk);

  // Echo trend: latency creeping up predicts next degradation
  let echoTrend = null;
  if (echo) {
    const worst = Object.entries(echo)
      .map(([kind, s]) => ({ kind, avgLatency: s.latencySum / Math.max(1, s.count), successRate: Math.round((s.success / s.count) * 100) }))
      .sort((a, b) => b.avgLatency - a.avgLatency)[0];
    if (worst && worst.avgLatency > 500) echoTrend = worst;
  }

  return { gates, echoTrend, generatedAt: new Date().toISOString() };
}

function inferGate(signature) {
  if (/TS\d+|typecheck|cannot find name/i.test(signature)) return 'typecheck';
  if (/crypto|key|signature/i.test(signature)) return 'crypto';
  if (/secret|\.env|token/i.test(signature)) return 'secrets';
  if (/lint|warning|prettier/i.test(signature)) return 'lint';
  if (/redis|quota|max requests/i.test(signature)) return 'redis';
  if (/gemini|provider|api key/i.test(signature)) return 'providers';
  return 'unknown';
}

const f = forecast();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(f, null, 2));
} else {
  console.log('═ FAILURE FORECASTER ═');
  if (!f.gates.length) {
    console.log('No learned failure patterns yet — system is healthy, nothing to predict.');
  } else {
    for (const g of f.gates) {
      const icon = g.risk >= 60 ? '🔴' : g.risk >= 30 ? '🟡' : '🟢';
      console.log(`${icon} ${g.gate}: risk ${g.risk}% (${g.hits} hits, ${g.recentHits} recent)`);
      if (g.risk >= 60) console.log(`   → PROACTIVE: check ${g.examples[0] || 'recent fix'}`);
    }
  }
  if (f.echoTrend) {
    console.log(`\n⚠ Echo trend: ${f.echoTrend.kind} latency ${f.echoTrend.avgLatency}ms, ${f.echoTrend.successRate}% success`);
  }
  console.log('\nNext: run `node scripts/self-heal.mjs heal` to apply known fixes proactively.');
}
