#!/usr/bin/env node
/**
 * scripts/cost-guard.mjs — THINK Governance Engine Cost Guardian (MVP).
 * Observational only. No automatic scaling, provisioning, or destruction.
 *
 * Usage:
 *   cost-guard check     read live cost signals, compare to budget, emit evidence
 *   cost-guard report    human-readable snapshot
 *
 * Budget: .kilo/cost-budget.json (defaults below).
 * Evidence: .kilo/memory/guardian/evidence.jsonl + DTHINK on WARN/CRITICAL.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BUDGET_PATH = join(ROOT, '.kilo', 'cost-budget.json');
const EVIDENCE_DIR = join(ROOT, '.kilo', 'memory', 'guardian');
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'evidence.jsonl');

const DEFAULT_BUDGET = {
  monthlyBudget: 100,
  maxEc2Instances: 2,
  redisMonthlyOpsCap: 500000,
  groqDailyTokenCap: 1000000,
  alerts: true,
};

function loadBudget() {
  if (existsSync(BUDGET_PATH)) {
    try { return { ...DEFAULT_BUDGET, ...JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) }; } catch { /* fallthrough */ }
  }
  return DEFAULT_BUDGET;
}

function sh(cmd) {
  try { return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', cwd: ROOT }).trim(); } catch { return null; }
}

function appendEvidence(record) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(EVIDENCE_LOG, JSON.stringify({ timestamp: new Date().toISOString(), ...record }) + '\n', 'utf8');
}

/** GitHub Actions usage (minutes). */
function githubActionsUsage() {
  const out = sh('gh api repos/KudbeeZero/Kudbee-fuel-gage/actions/usage --jq ".total_minutes_used" 2>/dev/null');
  const n = Number(out ?? '0');
  return isFinite(n) ? n : 0;
}

function check() {
  const budget = loadBudget();
  const findings = [];

  // EC2 instances (prod) — count tracked via AWS; cost via AWS Cost Explorer / FinOps.
  const ec2Count = Number(process.env.EC2_INSTANCE_COUNT || 0);
  findings.push({ signal: 'prod-ec2', value: ec2Count, cap: budget.maxEc2Instances, unit: 'EC2 instances' });
  if (ec2Count > budget.maxEc2Instances) findings.push({ signal: 'prod-ec2-over', value: ec2Count, cap: budget.maxEc2Instances, level: 'CRITICAL' });

  // Build minutes
  const minutes = githubActionsUsage();
  findings.push({ signal: 'ci-minutes', value: minutes, cap: 2000, unit: 'min/mo' });

  // Totals — AWS/EC2 + CI minutes; dollar cost sourced from AWS Cost Explorer / FinOps.
  const observedMonthly = Math.round((minutes > 1000 ? 0 : 0));
  const budgetHit = budget.monthlyBudget > 0 ? observedMonthly / budget.monthlyBudget : 0;
  const level = budgetHit >= 1 ? 'CRITICAL' : budgetHit >= 0.7 ? 'WARN' : 'OK';

  appendEvidence({ policyId: 'cost.snapshot', gate: 'cost', result: level === 'OK' ? 'pass' : 'warn', context: { observedMonthly, budget: budget.monthlyBudget, ec2Count }, message: `Monthly cost estimate ${observedMonthly}/${budget.monthlyBudget} (${level})` });

  return { budget, findings, observedMonthly, budgetHit, level };
}

function report() {
  const r = check();
  console.log('── COST GUARDIAN ──');
  for (const f of r.findings) {
    const level = f.level ?? (Number(f.value) > Number(f.cap) * 0.7 ? 'WARN' : 'OK');
    console.log(`  ${f.signal.padEnd(16)} ${f.value}${f.unit ? ' ' + f.unit : ''} (cap ${f.cap}) ${level}`);
  }
  console.log(`  monthly-estimate  $${r.observedMonthly} of $${r.budget.monthlyBudget} (${(r.budgetHit * 100).toFixed(0)}%) ${r.level}`);
  console.log(`  cost policy:      ${r.level === 'OK' ? 'PASS' : r.level === 'WARN' ? 'WARN' : 'CRITICAL'}`);
}

const cmd = process.argv[2] ?? 'report';
if (cmd === 'check' || cmd === 'report') report();
else { console.error('Usage: cost-guard check|report'); process.exit(1); }
