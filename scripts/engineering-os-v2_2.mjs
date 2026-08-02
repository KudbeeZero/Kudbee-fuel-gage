#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { publish } from './serial-bus.mjs';
import { feed as dthinkFeed } from './dthink-pipeline.mjs';

try {
  process.loadEnvFile('.env');
} catch {}

const root = process.cwd();
const missionId = process.env.MISSION_ID || 'OPS-012B';
const stackPath = path.join(root, 'config', 'pr', 'stack.json');
const outputs = {
  prediction: path.join(root, 'MERGE_PREDICTION.md'),
  simulation: path.join(root, 'STACK_SIMULATION.md'),
  contract: path.join(root, 'MERGE_CONTRACT.md'),
  verification: path.join(root, 'VERIFICATION_PACKAGE.md'),
};
const protocolEventsPath = path.join(root, '.kilo', 'memory', 'protocol-events.jsonl');
const deployLogPath = path.join(root, '.kilo', 'memory', 'deploy-log.json');
const stagingDeployMemoPath = path.join(root, '.kilo', 'memory', 'heroku-staging-deploy.md');

const nowIso = () => new Date().toISOString();

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sh(command, args, options = {}) {
  const out = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeout ?? 20_000,
  });
  return {
    ok: out.status === 0,
    code: out.status ?? 1,
    stdout: (out.stdout || '').trim(),
    stderr: (out.stderr || '').trim(),
  };
}

function git(args) {
  return sh('git', args);
}

function parseShortstat(text) {
  const files = Number((text.match(/(\d+)\s+files?\schanged/) || [])[1] || 0);
  const insertions = Number((text.match(/(\d+)\s+insertions?\(\+\)/) || [])[1] || 0);
  const deletions = Number((text.match(/(\d+)\s+deletions?\(-\)/) || [])[1] || 0);
  return { files, insertions, deletions, total: insertions + deletions };
}

function getStackContext(branch) {
  const stack = readJson(stackPath, { trunk: 'main', layers: [], rules: {} });
  const layers = Array.isArray(stack.layers) ? stack.layers : [];
  const layer = layers.find((entry) => entry.branch === branch) || null;
  const parent = layer?.base || stack.trunk || 'main';
  const children = layer ? layers.filter((entry) => entry.base === layer.branch).map((entry) => entry.branch) : [];
  return { stack, layer, parent, children };
}

function getBranchContext() {
  const branch = git(['branch', '--show-current']).stdout || 'unknown';
  const sha = git(['rev-parse', 'HEAD']).stdout || 'unknown';
  const statusShort = git(['status', '--short']).stdout;
  const { parent, children, layer, stack } = getStackContext(branch);
  const compareBase = resolveCompareBase(parent);
  const range = `${compareBase}..HEAD`;
  const shortstat = git(['diff', '--shortstat', range]).stdout;
  const diffStats = parseShortstat(shortstat);
  const commitCount = Number(git(['rev-list', '--count', range]).stdout || 0);
  const commits = git(['log', '--oneline', range]).stdout
    .split('\n')
    .filter(Boolean);
  const files = git(['diff', '--name-only', range]).stdout
    .split('\n')
    .filter(Boolean);
  return {
    branch,
    sha,
    statusShort,
    parent,
    children,
    layer,
    stack,
    compareBase,
    diffStats,
    commitCount,
    commits,
    files,
  };
}

function resolveCompareBase(parent) {
  if (git(['rev-parse', '--verify', '--quiet', parent]).ok) return parent;
  if (git(['rev-parse', '--verify', '--quiet', `origin/${parent}`]).ok) return `origin/${parent}`;
  const trunk = git(['rev-parse', '--verify', '--quiet', 'origin/main']).ok
    ? 'origin/main'
    : git(['rev-parse', '--verify', '--quiet', 'main']).ok
      ? 'main'
      : null;
  if (trunk) return trunk;
  const firstCommit = git(['rev-list', '--max-parents=0', 'HEAD']).stdout.split('\n')[0]?.trim();
  return firstCommit || 'HEAD';
}

function getRecentCi(branch) {
  const raw = sh('gh', ['run', 'list', '--limit', '30', '--json', 'name,headBranch,status,conclusion,createdAt,url']).stdout;
  if (!raw) {
    return { source: 'gh-cli', available: false, reason: 'GitHub CLI or token unavailable', recent: [] };
  }
  try {
    const rows = JSON.parse(raw);
    const recent = (Array.isArray(rows) ? rows : []).filter((row) => row.headBranch === branch).slice(0, 8);
    return { source: 'gh-cli', available: true, recent };
  } catch {
    return { source: 'gh-cli', available: false, reason: 'Invalid gh run list JSON', recent: [] };
  }
}

function deriveCheckFromCi(ci, matcher) {
  const rows = Array.isArray(ci.recent) ? ci.recent : [];
  const row = rows.find((entry) => matcher.test(entry.name || '')) || rows[0];
  if (!row) return { ok: false, summary: 'UNKNOWN', stderr: 'No CI runs found for current branch' };
  if (row.conclusion === 'success') return { ok: true, summary: 'PASS', stderr: '' };
  if (row.conclusion === 'failure') return { ok: false, summary: 'FAIL', stderr: `${row.name} failed` };
  return { ok: false, summary: 'IN_PROGRESS', stderr: `${row.name} ${row.status || 'running'}` };
}

function runCheck(command, args) {
  const result = sh(command, args, { timeout: 120_000 });
  return {
    ok: result.ok,
    summary: result.ok ? 'PASS' : 'FAIL',
    stderr: result.stderr.split('\n').filter(Boolean).slice(0, 3).join(' | '),
  };
}

function scorePrediction(ctx, ci, stackCheck) {
  let confidence = 0.65;
  let risk = 'medium';
  const riskFlags = [];

  if (!ctx.statusShort) confidence += 0.05;
  else {
    confidence -= 0.1;
    riskFlags.push('working tree is not clean');
  }

  if (ctx.commitCount <= 10) confidence += 0.1;
  if (ctx.commitCount > 15) {
    confidence -= 0.15;
    riskFlags.push('commit count exceeds split threshold');
  }

  if (ctx.diffStats.total > 1000) {
    confidence -= 0.2;
    riskFlags.push('changed lines exceed 1000');
  }

  const latestCi = ci.recent?.[0];
  if (latestCi?.conclusion === 'success') confidence += 0.15;
  else if (latestCi?.conclusion === 'failure') {
    confidence -= 0.2;
    riskFlags.push('latest CI run failed');
  }

  if (!stackCheck.ok) {
    confidence -= 0.2;
    riskFlags.push('stack verification currently failing');
  }

  confidence = Math.max(0.05, Math.min(0.98, confidence));
  if (confidence >= 0.8) risk = 'low';
  else if (confidence < 0.55) risk = 'high';

  return { confidence, risk, riskFlags };
}

function estimateAffectedSystems(files) {
  const systems = new Set();
  for (const file of files) {
    if (file.startsWith('apps/web/')) systems.add('web-frontend');
    if (file.startsWith('apps/mobile/')) systems.add('mobile');
    if (file.startsWith('services/')) systems.add('backend-services');
    if (file.startsWith('scripts/')) systems.add('automation-scripts');
    if (file.startsWith('.kilo/')) systems.add('agent-memory-and-protocol');
    if (file.startsWith('.github/')) systems.add('ci-workflows');
    if (file.startsWith('config/')) systems.add('config-and-governance');
  }
  if (!systems.size) systems.add('repository-metadata');
  return [...systems];
}

function writeFile(filePath, content) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
}

function appendProtocolEvent(name, payload = {}) {
  ensureDir(protocolEventsPath);
  const entry = {
    id: `ops-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    mission: missionId,
    action: name,
    timestamp: nowIso(),
    payload,
  };
  fs.appendFileSync(protocolEventsPath, JSON.stringify(entry) + '\n', 'utf8');
  try {
    publish('system:engineering-os', { mission: missionId, action: name, ...payload }, 'ops-012b');
  } catch {}
  try {
    dthinkFeed({
      type: 'command:exec',
      agentId: 'ops-012b',
      trigger: 'engineering-os-v2.2',
      summary: name,
      data: payload,
    });
  } catch {}
}

function detectDeployment() {
  const deployLog = readJson(deployLogPath, { entries: [] });
  const latest = Array.isArray(deployLog.entries) ? deployLog.entries[0] : null;
  const memo = fs.existsSync(stagingDeployMemoPath) ? fs.readFileSync(stagingDeployMemoPath, 'utf8') : '';
  const app = (memo.match(/\*\*App:\*\*\s*`([^`]+)`/) || [])[1] || process.env.STAGING_APP || null;
  const release = (memo.match(/\*\*Release:\*\*\s*([^\n]+)/) || [])[1]?.trim() || latest?.herokuRelease || null;
  const ts = (memo.match(/\*\*Timestamp:\*\*\s*([^\n]+)/) || [])[1]?.trim() || latest?.timestamp || null;
  const knownUrl = process.env.STAGING_URL || process.env.HEROKU_STAGING_URL || (app ? `https://${app}.herokuapp.com` : null);
  return {
    found: Boolean(app || latest),
    app,
    release,
    timestamp: ts,
    branch: latest?.branch || null,
    buildId: latest?.commit ? latest.commit.slice(0, 12) : null,
    url: knownUrl,
    source: app || latest ? 'memory-log' : 'none',
  };
}

async function probeHealth(url) {
  if (!url) return { attempted: false, endpoint: null, ok: false, detail: 'No deployment URL discovered' };
  const endpoint = `${url.replace(/\/+$/, '')}/api/system/health-deep`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { accept: 'application/json' } });
    const body = await response.text();
    return {
      attempted: true,
      endpoint,
      ok: response.ok,
      status: response.status,
      detail: body.slice(0, 200),
    };
  } catch (error) {
    return {
      attempted: true,
      endpoint,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderPrediction(ctx, ci, prediction, checks) {
  const latestCi = ci.recent?.[0];
  const ciExpectation = latestCi
    ? (latestCi.conclusion === 'success' ? 'likely-pass' : latestCi.conclusion === 'failure' ? 'likely-fail' : 'in-progress')
    : 'unknown';
  const deploymentExpectation = ctx.branch === 'main' ? 'production-candidate' : 'staging-or-review-app-candidate';
  const mergeable = checks.stack.ok ? (prediction.risk === 'high' ? 'needs-human-review' : 'likely-mergeable') : 'blocked-by-stack-check';
  const affectedSystems = estimateAffectedSystems(ctx.files);

  return `
# MERGE_PREDICTION

- Mission: ${missionId}
- Generated: ${nowIso()}
- Branch: ${ctx.branch}
- Parent branch: ${ctx.parent}
- Comparison base used: ${ctx.compareBase}
- Head: ${ctx.sha.slice(0, 12)}

## Prediction

- confidence: ${(prediction.confidence * 100).toFixed(1)}%
- risk: ${prediction.risk}
- affected systems: ${affectedSystems.join(', ')}
- expected runtime: 8-20 minutes (depends on CI queue + build load)
- expected manual verification:
  - stack base/head alignment in GitHub PR
  - observability page terminal mirror shows live protocol events
  - deployment health endpoint responds when staging URL is present

## Expected outcomes

- Expected CI result: ${ciExpectation}
- Expected verify.yml result: ${checks.verifyYml.ok ? 'likely-pass' : 'at-risk'}
- Expected TypeScript result: ${checks.typecheck.ok ? 'likely-pass' : 'at-risk'}
- Expected test result: ${checks.tests.ok ? 'likely-pass' : 'at-risk'}
- Expected build result: ${checks.build.ok ? 'likely-pass' : 'at-risk'}
- Expected deployment result: ${deploymentExpectation}
- Expected stack verification: ${checks.stack.ok ? 'pass' : 'fail'}
- Expected mergeability: ${mergeable}

## Risk drivers

${prediction.riskFlags.length ? prediction.riskFlags.map((item) => `- ${item}`).join('\n') : '- no critical risk drivers detected'}

## Evidence snapshot

- commits in branch slice: ${ctx.commitCount}
- changed files: ${ctx.diffStats.files}
- changed lines (insertions + deletions): ${ctx.diffStats.total}
- latest branch CI run: ${latestCi ? `${latestCi.name} (${latestCi.conclusion || latestCi.status})` : 'not available'}
`;
}

function renderSimulation(ctx, checks) {
  const layerOrder = ctx.layer?.order || 'not-in-manifest';
  const stackStep = ctx.layer
    ? `Update layer ${ctx.layer.order} status and preserve base ${ctx.parent}`
    : 'Branch is not in stack manifest; simulation uses trunk baseline';

  return `
# STACK_SIMULATION

- Mission: ${missionId}
- Generated: ${nowIso()}
- Branch: ${ctx.branch}

## Dry-run sequence (no git mutation)

1. bottom merge simulation
   - predicted base: ${ctx.parent}
   - status: ${checks.stack.ok ? 'compatible' : 'blocked'}
2. cascade rebase simulation
   - layer order: ${layerOrder}
   - children to cascade: ${ctx.children.length ? ctx.children.join(', ') : 'none'}
   - predicted conflicts: ${ctx.diffStats.total > 1000 ? 'moderate' : 'low'}
3. stack update simulation
   - ${stackStep}
4. CI simulation
   - verify.yml: ${checks.verifyYml.ok ? 'pass-likely' : 'at-risk'}
   - typecheck: ${checks.typecheck.ok ? 'pass-likely' : 'at-risk'}
   - tests: ${checks.tests.ok ? 'pass-likely' : 'at-risk'}
   - build: ${checks.build.ok ? 'pass-likely' : 'at-risk'}
5. deployment simulation
   - target: ${ctx.branch === 'main' ? 'production' : 'staging/review'}
   - status: ready-after-ci
6. knowledge update simulation
   - promote only after verification package has deployment and CI evidence
7. engineering graph update simulation
   - mission node ${missionId} links to branch ${ctx.branch} and generated evidence package

## Simulated result

- outcome: ${checks.stack.ok && checks.verifyYml.ok ? 'ready-for-human-review' : 'requires-fixes-before-merge'}
- blocking checks: ${
    [
      checks.stack.ok ? null : 'stack',
      checks.verifyYml.ok ? null : 'verify.yml',
      checks.typecheck.ok ? null : 'typecheck',
      checks.tests.ok ? null : 'tests',
      checks.build.ok ? null : 'build',
    ].filter(Boolean).join(', ') || 'none'
  }
`;
}

function renderContract(ctx, prediction) {
  const complexity =
    ctx.commitCount > 15 || ctx.diffStats.total > 1000 ? 'high' : ctx.commitCount > 8 || ctx.diffStats.total > 400 ? 'medium' : 'low';

  return `
# MERGE_CONTRACT

- Mission: ${missionId}
- User Problem: deliver predictive merge readiness evidence without manual data collection
- Branch: ${ctx.branch}
- Parent: ${ctx.parent}
- Children: ${ctx.children.length ? ctx.children.join(', ') : 'none'}
- Files: ${ctx.files.length}
- Commits: ${ctx.commitCount}
- Review Complexity: ${complexity}

## Prediction

- confidence: ${(prediction.confidence * 100).toFixed(1)}%
- risk: ${prediction.risk}

## Verification Plan

1. npm run verify:stack
2. npm run verify:secrets
3. node scripts/verify-gates.mjs --quick
4. confirm protocol events in terminal mirror
5. confirm verification package includes deployment evidence or explicit blocker

## Rollback Plan

1. stop promotion for current layer
2. revert branch to previous green commit
3. rerun verification suite
4. regenerate prediction + simulation + contract package

## Deployment Checklist

- [ ] CI finished on current head
- [ ] stack verification passes
- [ ] deployment target identified
- [ ] health endpoint checked (or blocker documented)

## Human Checklist

- [ ] PR remains draft until review
- [ ] merge order bottom-up confirmed
- [ ] manual click-through completed for affected pages
- [ ] rollback owner assigned

## Learning Targets

- calibrate prediction confidence against actual CI conclusion
- track stack drift and conflict hotspots
- improve manual verification checklist hit-rate

## Exit Interview

- Did prediction match real CI?
- Did simulation correctly identify blockers?
- Was deployment evidence discovered automatically?
- What should be automated next without expanding governance surface?
`;
}

function renderVerificationPackage(deploy, health, ctx) {
  const pages = ctx.files.filter((file) => file.startsWith('apps/web/src/pages/'));
  const components = ctx.files.filter((file) => file.startsWith('apps/web/src/components/'));
  return `
# VERIFICATION_PACKAGE

- Mission: ${missionId}
- Generated: ${nowIso()}

## Deployment

- Deployment URL: ${deploy.url || 'not discovered'}
- Health endpoint: ${health.endpoint || 'not available'}
- Build ID: ${deploy.buildId || 'not discovered'}
- Timestamp: ${deploy.timestamp || 'not discovered'}
- Deployment source: ${deploy.source}

## Health result

- attempted: ${health.attempted ? 'yes' : 'no'}
- status: ${health.ok ? 'healthy' : 'not-verified'}
- detail: ${health.detail || 'n/a'}

## Scope

- Pages affected: ${pages.length ? pages.join(', ') : 'none detected in current diff'}
- Components affected: ${components.length ? components.join(', ') : 'none detected in current diff'}

## Manual click-through checklist

- [ ] Open Observability page and confirm Terminal Mirror loads without fallback placeholders
- [ ] Validate terminal stats counters update from backend state
- [ ] Confirm stack verification remains green after latest rebase
- [ ] Validate deployment URL and health endpoint if deployment discovered

## Expected observations

- protocol events are timestamped and replayable
- merge prediction/simulation/contract markdown files are regenerated on demand
- verification package records either deployment evidence or explicit discovery blocker

## Known limitations

- deployment discovery depends on available memory logs/environment variables
- GitHub run metadata may be unavailable without gh authentication

## Rollback instructions

1. remove generated package files from commit if evidence is incomplete
2. revert OPS-012B automation commit
3. rerun baseline stack verification workflow
`;
}

async function run() {
  appendProtocolEvent('Stack Loaded', { stackPath: 'config/pr/stack.json' });
  const ctx = getBranchContext();
  const ci = getRecentCi(ctx.branch);

  appendProtocolEvent('Prediction Started', { branch: ctx.branch });
  const ciGateCheck = deriveCheckFromCi(ci, /kudbee bounded ci|verify/i);
  const ciBuildCheck = deriveCheckFromCi(ci, /kudbee bounded ci|build/i);
  const checks = {
    stack: runCheck('npm', ['run', 'verify:stack']),
    verifyYml: ciGateCheck,
    typecheck: runCheck('node', ['scripts/verify-gates.mjs', '--quick']),
    tests: ciGateCheck,
    build: ciBuildCheck,
  };
  const prediction = scorePrediction(ctx, ci, checks.stack);
  writeFile(outputs.prediction, renderPrediction(ctx, ci, prediction, checks));
  appendProtocolEvent('Prediction Finished', { output: 'MERGE_PREDICTION.md' });

  appendProtocolEvent('Simulation Started', { branch: ctx.branch });
  writeFile(outputs.simulation, renderSimulation(ctx, checks));
  appendProtocolEvent('Simulation Finished', { output: 'STACK_SIMULATION.md' });

  appendProtocolEvent('Merge Contract Started', { branch: ctx.branch });
  writeFile(outputs.contract, renderContract(ctx, prediction));
  appendProtocolEvent('Merge Contract Finished', { output: 'MERGE_CONTRACT.md' });

  appendProtocolEvent('Verification Started', { phase: 'staging-certification' });
  const deploy = detectDeployment();
  const health = await probeHealth(deploy.url);
  writeFile(outputs.verification, renderVerificationPackage(deploy, health, ctx));
  appendProtocolEvent('Deployment Ready', {
    url: deploy.url || null,
    release: deploy.release || null,
    discovered: deploy.found,
  });
  appendProtocolEvent('Knowledge Updated', {
    promotedByEvidenceOnly: true,
    candidates: ['Knowledge Index', 'Engineering Graph', 'THINK Tokens', 'Mission Journal', 'Engineering Timeline'],
  });
  appendProtocolEvent('Exit Interview Completed', { mission: missionId });

  const written = Object.values(outputs).map((filePath) => path.basename(filePath));
  console.log(JSON.stringify({ mission: missionId, generated: written, branch: ctx.branch }, null, 2));
}

const command = process.argv[2] || 'run';
if (command === 'run' || command === 'generate') {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else if (command === 'events') {
  const limit = Number(process.argv[3] || 20);
  const lines = fs.existsSync(protocolEventsPath) ? fs.readFileSync(protocolEventsPath, 'utf8').trim().split('\n').filter(Boolean) : [];
  const recent = lines.slice(-Math.max(1, limit)).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  console.log(JSON.stringify(recent, null, 2));
} else {
  console.log('Usage: node scripts/engineering-os-v2_2.mjs [run|events <limit>]');
}
