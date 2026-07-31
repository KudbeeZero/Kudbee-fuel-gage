#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync('config/pr/stack.json', 'utf8'));
const failures = [];
const warnings = [];
const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const warn = (id, detail) => {
  warnings.push(id);
  console.warn(`[WARN] ${id}: ${detail}`);
};
const fail = (id, detail) => {
  failures.push(id);
  console.error(`[FAIL] ${id}: ${detail}`);
};
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

if (!config.rules?.sameRepository || !config.rules?.bottomUpMerge || !config.rules?.productionDeployFromTrunkOnly) {
  fail('stack-rules', 'required bottom-up and production-trunk rules are missing');
}

const seen = new Set();
for (const [index, layer] of (config.layers || []).entries()) {
  if (layer.order !== index + 1) fail(`layer:${layer.pullRequest}`, 'layer order is not contiguous');
  if (seen.has(layer.branch)) fail(`layer:${layer.pullRequest}`, 'branch appears more than once');
  seen.add(layer.branch);
  const ref = `refs/remotes/origin/${layer.branch}`;
  try { git(['show-ref', '--verify', '--quiet', ref]); }
  catch { warn(`ref:${layer.branch}`, 'remote branch is not available in this clone'); }

  if (layer.order > 1) {
    const below = config.layers[index - 1];
    if (layer.base !== below.branch) fail(`base:${layer.pullRequest}`, `must target ${below.branch}`);
    try {
      git(['merge-base', '--is-ancestor', `origin/${below.branch}`, `origin/${layer.branch}`]);
      pass(`ancestry:${layer.pullRequest}`, `${below.branch} is an ancestor of ${layer.branch}`);
    } catch {
      warn(`ancestry:${layer.pullRequest}`, 'remote refs unavailable or branch is not currently rebased');
    }
  } else if (layer.base !== config.trunk) {
    fail(`base:${layer.pullRequest}`, `bottom layer must target ${config.trunk}`);
  } else pass(`base:${layer.pullRequest}`, `bottom layer targets ${config.trunk}`);

  try {
    const pr = JSON.parse(execFileSync('gh', ['pr', 'view', String(layer.pullRequest), '--repo', config.repository, '--json', 'baseRefName,headRefName,isDraft,mergeStateStatus,url'], { cwd: root, encoding: 'utf8' }));
    if (pr.baseRefName !== layer.base || pr.headRefName !== layer.branch) {
      fail(`github:${layer.pullRequest}`, 'GitHub PR base/head does not match stack manifest');
    } else if (pr.isDraft !== true) {
      warn(`review:${layer.pullRequest}`, 'PR is not draft; human review state should be verified');
    } else pass(`github:${layer.pullRequest}`, `${pr.headRefName} -> ${pr.baseRefName}`);
  } catch {
    warn(`github:${layer.pullRequest}`, 'GitHub PR metadata unavailable in this environment');
  }
}

console.log(`\nStack verification: ${failures.length ? 'BLOCKED' : 'READY'}; ${warnings.length} warnings; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
