#!/usr/bin/env node
/**
 * scripts/decision-ledger.mjs — INT-028 Decision Ledger
 * ---------------------------------------------------------------------------
 * Immutable, append-only record of significant engineering decisions.
 *
 * Every decision captures why it was made, what was considered, what evidence
 * and benchmarks informed it, what risks were accepted, and the rollback plan.
 * Once recorded, entries are never mutated — corrections create a new entry
 * with a reference to the one they supersede.
 *
 * This is the foundation for INT-029 (counterfactuals), INT-033 (decision
 * replay), INT-034 (advisor), and INT-035 (mission ROI).
 *
 * Usage:
 *   node scripts/decision-ledger.mjs record <mission> "<problem>" "<chosen>" \
 *     --alternatives "A|B|C" --evidence "<evidence>" --benchmarks "BMK-0003" \
 *     --risks "<risks>" --rollback "<plan>" --confidence 83
 *   node scripts/decision-ledger.mjs list [--mission INT-011]
 *   node scripts/decision-ledger.mjs show <decision-id>
 *   node scripts/decision-ledger.mjs stats
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LEDGER_DIR = join(REPO_ROOT, 'benchmarks', 'decisions');
const LEDGER_PATH = join(LEDGER_DIR, 'ledger.json');

mkdirSync(LEDGER_DIR, { recursive: true });

function loadLedger() {
  try {
    if (existsSync(LEDGER_PATH)) return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), decisions: [] };
}

function saveLedger(ledger) {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
}

function nextId(ledger) {
  const nums = ledger.decisions.map((d) => Number(d.id.replace('DEC-', '')) || 0);
  return `DEC-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
}

function recordDecision(opts) {
  const ledger = loadLedger();
  const decision = {
    id: nextId(ledger),
    mission: opts.mission || 'UNASSIGNED',
    problem: opts.problem,
    alternatives: (opts.alternatives || '').split('|').map((s) => s.trim()).filter(Boolean),
    chosen: opts.chosen,
    evidence: opts.evidence || '',
    benchmarksConsulted: (opts.benchmarks || '').split(',').map((s) => s.trim()).filter(Boolean),
    risksAccepted: opts.risks || '',
    rollbackPlan: opts.rollback || '',
    confidence: opts.confidence != null ? Number(opts.confidence) : null,
    status: opts.status || 'DECIDED',
    recordedAt: new Date().toISOString(),
    reviewDate: null,
    outcome: null,
    supersedes: opts.supersedes || null,
  };
  ledger.decisions.push(decision);
  saveLedger(ledger);
  return decision;
}

function confidenceSummary(confidence) {
  if (confidence == null) return 'not estimated';
  if (confidence >= 85) return 'high confidence — strong evidence';
  if (confidence >= 70) return 'moderate confidence — some evidence, known unknowns';
  if (confidence >= 50) return 'low confidence — weak evidence, proceed cautiously';
  return 'very low confidence — decision made under high uncertainty';
}

const args = process.argv.slice(2);
const cmd = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'record': {
      const positional = args.filter((a) => !a.startsWith('--'));
      const [mission, problem, chosen, ...rest] = positional.slice(1);
      if (!mission || !problem || !chosen) {
        console.error('Usage: record <mission> "<problem>" "<chosen>" [--alternatives "A|B|C"] [--evidence ...] [--benchmarks ...] [--risks ...] [--rollback ...] [--confidence N]');
        process.exit(1);
      }
      const flag = (name) => {
        const i = args.indexOf(name);
        return i !== -1 ? args[i + 1] : undefined;
      };
      const decision = recordDecision({
        mission,
        problem,
        chosen,
        alternatives: flag('--alternatives'),
        evidence: flag('--evidence'),
        benchmarks: flag('--benchmarks'),
        risks: flag('--risks'),
        rollback: flag('--rollback'),
        confidence: flag('--confidence'),
      });
      console.log(`\n  [INT-028] DECISION RECORDED: ${decision.id}`);
      console.log(`  mission:     ${decision.mission}`);
      console.log(`  problem:     ${decision.problem}`);
      console.log(`  chosen:      ${decision.chosen}`);
      console.log(`  alternatives: ${decision.alternatives.length ? decision.alternatives.join(' | ') : 'none'}`);
      console.log(`  benchmarks:  ${decision.benchmarksConsulted.length ? decision.benchmarksConsulted.join(', ') : 'none'}`);
      console.log(`  confidence:  ${decision.confidence != null ? decision.confidence + '% — ' + confidenceSummary(decision.confidence) : 'not estimated'}`);
      console.log(`  recordedAt:  ${decision.recordedAt}`);
      console.log('\n  Immutable — corrections must create a new entry with --supersedes.\n');
      break;
    }

    case 'list': {
      const ledger = loadLedger();
      const missionFilter = (() => {
        const i = args.indexOf('--mission');
        return i !== -1 ? args[i + 1] : null;
      })();
      console.log('\n  ╔══════════════════════════════════════════════════╗');
      console.log('  ║  INT-028 — DECISION LEDGER                       ║');
      console.log('  ╠══════════════════════════════════════════════════╣');
      for (const d of ledger.decisions) {
        if (missionFilter && d.mission !== missionFilter) continue;
        const conf = d.confidence != null ? `${d.confidence}%` : '—';
        console.log(`  ║  ${d.id}  [${d.mission.padEnd(12)}] c=${conf.padEnd(4)} ${d.problem.slice(0, 40).padEnd(44)}║`);
      }
      console.log(`  ╠══════════════════════════════════════════════════╣`);
      console.log(`  ║  total decisions: ${String(ledger.decisions.length).padEnd(43)}║`);
      console.log('  ╚══════════════════════════════════════════════════╝\n');
      break;
    }

    case 'show': {
      const id = args[1];
      if (!id) { console.error('Usage: show <decision-id>'); process.exit(1); }
      const ledger = loadLedger();
      const d = ledger.decisions.find((x) => x.id === id);
      if (!d) { console.error(`Decision not found: ${id}`); process.exit(1); }
      console.log(`\n  ${d.id}  (${d.mission})  [${d.status}]`);
      console.log(`  problem:      ${d.problem}`);
      console.log(`  chosen:       ${d.chosen}`);
      if (d.alternatives.length) console.log(`  alternatives: ${d.alternatives.join('\n                | ')}`);
      if (d.evidence) console.log(`  evidence:     ${d.evidence}`);
      if (d.benchmarksConsulted.length) console.log(`  benchmarks:   ${d.benchmarksConsulted.join(', ')}`);
      if (d.risksAccepted) console.log(`  risks:        ${d.risksAccepted}`);
      if (d.rollbackPlan) console.log(`  rollback:     ${d.rollbackPlan}`);
      if (d.confidence != null) console.log(`  confidence:   ${d.confidence}% — ${confidenceSummary(d.confidence)}`);
      console.log(`  recorded:     ${d.recordedAt}`);
      if (d.supersedes) console.log(`  supersedes:   ${d.supersedes}`);
      console.log('\n');
      break;
    }

    case 'stats': {
      const ledger = loadLedger();
      const byMission = {};
      for (const d of ledger.decisions) byMission[d.mission] = (byMission[d.mission] || 0) + 1;
      console.log('\n  Decision Ledger stats:');
      console.log(`  total: ${ledger.decisions.length}`);
      for (const [m, n] of Object.entries(byMission).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${m.padEnd(16)} ${n}`);
      }
      console.log('');
      break;
    }

    default:
      console.log(`
  INT-028 Decision Ledger

  Commands:
    record <mission> "<problem>" "<chosen>" [flags]
    list [--mission <id>]
    show <decision-id>
    stats

  Record flags:
    --alternatives "A|B|C"   alternatives considered (pipe-separated)
    --evidence "..."          evidence that informed the decision
    --benchmarks "BMK-0001"   benchmarks consulted (comma-separated)
    --risks "..."             risks accepted
    --rollback "..."          rollback plan
    --confidence 83           decision confidence (0-100)
    --supersedes DEC-0001     id this decision supersedes
`);
      process.exit(1);
  }
}
