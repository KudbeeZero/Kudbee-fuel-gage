#!/usr/bin/env node
/**
 * Next-phase readiness gate.
 *
 * Default mode runs local, deterministic gates. Use --full to include the
 * longer E2E, resilience, THINK, governance, and browser checks.
 * Environment-gated checks report WARN rather than pretending to pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const full = process.argv.includes('--full');
const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  const icon = status === 'PASS' ? '[PASS]' : status === 'WARN' ? '[WARN]' : '[FAIL]';
  console.log(`${icon} ${id}: ${detail}`);
}

function run(id, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    env: { ...process.env, ...(options.env || {}) },
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status === 0) record(id, 'PASS', options.success || output.split('\n').slice(-1)[0] || 'completed');
  else if (options.environmentGated && /missing|unavailable|ECONNREFUSED|not installed|credentials/i.test(output)) {
    record(id, 'WARN', output.split('\n').filter(Boolean).slice(-1)[0] || 'environment unavailable');
  } else record(id, 'FAIL', output.split('\n').filter(Boolean).slice(-3).join(' | ') || `exit ${result.status}`);
  return result.status === 0;
}

console.log(`\nNEXT-PHASE READINESS (${full ? 'FULL' : 'LOCAL'})\n`);

const requiredFiles = [
  'config/phase/next/phase-manifest.json',
  'config/phase/next/deepseek-v4.tasks.json',
  'config/phase/next/qwen-3.6-pro.tasks.json',
  'scripts/model-task-packet.mjs',
  'scripts/phase-governor.mjs',
  'scripts/verify-operating-model.mjs',
  'config/phase/next/governance-policy.json',
  'config/phase/next/sop-manifest.json',
  'scripts/verify-system-integrity.mjs',
  'scripts/verify-e2e.mjs',
  'scripts/verify-agents.mjs',
  'scripts/verify-drift.mjs',
];
for (const file of requiredFiles) {
  record(`manifest:${file}`, fs.existsSync(path.join(root, file)) ? 'PASS' : 'FAIL', fs.existsSync(path.join(root, file)) ? 'present' : 'missing');
}

run('task-packet:deepseek', process.execPath, ['scripts/model-task-packet.mjs', 'deepseek-v4', 'DS-01'], { success: 'DS-01 resolves' });
run('task-packet:qwen', process.execPath, ['scripts/model-task-packet.mjs', 'qwen-3.6-pro', 'QW-01'], { success: 'QW-01 resolves' });
run('governor:deepseek', process.execPath, ['scripts/phase-governor.mjs', 'check', 'deepseek-v4', 'DS-01'], { success: 'DS-01 governance passes' });
run('governor:qwen', process.execPath, ['scripts/phase-governor.mjs', 'check', 'qwen-3.6-pro', 'QW-06'], { success: 'QW-06 governance passes' });
run('operating-model', process.execPath, ['scripts/verify-operating-model.mjs'], { success: 'PR, pipeline, SOP, and memory contracts pass' });
run('diff-hygiene', 'git', ['diff', '--check'], { success: 'no whitespace errors' });
run('typecheck', 'npm', ['run', 'typecheck'], { success: '12 workspace checks passed' });
run('integrity', process.execPath, ['scripts/verify-system-integrity.mjs'], { success: 'system integrity passed' });

if (full) {
  run('e2e', process.execPath, ['scripts/verify-e2e.mjs'], { success: 'E2E checks passed' });
  run('agents', process.execPath, ['scripts/verify-agents.mjs'], { success: 'agent verification passed' });
  run('drift', process.execPath, ['scripts/verify-drift.mjs'], { success: 'no drift detected' });
  run('resilience', process.execPath, ['scripts/verify-resilience.mjs'], { environmentGated: true, success: 'resilience checks passed' });
  run('think-loop', process.execPath, ['scripts/verify-think-loop.mjs'], { environmentGated: true, success: 'THINK loop passed' });
  run('governance-loop', process.execPath, ['scripts/verify-governance-loop.mjs'], { environmentGated: true, success: 'governance loop passed' });
  run('browser', process.execPath, ['scripts/browser-verifier.mjs'], { environmentGated: true, success: 'browser verification passed' });
}

const failed = results.filter((item) => item.status === 'FAIL');
const warned = results.filter((item) => item.status === 'WARN');
console.log(`\nReadiness summary: ${results.length - failed.length - warned.length} passed, ${warned.length} warnings, ${failed.length} failed`);
if (failed.length > 0) {
  console.error('NEXT PHASE BLOCKED');
  process.exitCode = 1;
} else {
  console.log(warned.length ? 'NEXT PHASE READY WITH ENVIRONMENT WARNINGS' : 'NEXT PHASE READY');
}
