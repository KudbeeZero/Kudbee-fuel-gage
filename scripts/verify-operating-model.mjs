#!/usr/bin/env node
/** Audit PR, pipeline, SOP, agent, and memory operating contracts. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];
const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const fail = (id, detail) => { failures.push(`${id}: ${detail}`); console.error(`[FAIL] ${id}: ${detail}`); };
const warn = (id, detail) => { warnings.push(`${id}: ${detail}`); console.warn(`[WARN] ${id}: ${detail}`); };
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

if (!exists('config/phase/next/sop-manifest.json')) fail('sop-manifest', 'missing');
else {
  const manifest = JSON.parse(read('config/phase/next/sop-manifest.json'));
  const departments = Object.keys(manifest.departments || {});
  if (departments.length < 8) fail('departments', `only ${departments.length} defined`);
  else pass('departments', `${departments.length} departments mapped to owners and SOPs`);
  for (const artifact of manifest.requiredArtifacts || []) {
    if (exists(artifact)) pass(`artifact:${artifact}`, 'present');
    else fail(`artifact:${artifact}`, 'missing');
  }
}

const pr = read('.kilo/command/pr.md');
for (const required of ['phase-governor', 'verify-next-phase', 'git diff --check', 'npm run verify:typescript', 'review', 'rollback']) {
  if (pr.includes(required)) pass(`pr:${required}`, 'documented');
  else fail(`pr:${required}`, 'missing from PR workflow');
}

const rootPackage = JSON.parse(read('package.json'));
const tsScript = rootPackage.scripts?.['verify:typescript'];
if (tsScript === 'node scripts/verify-typescript-version.mjs' || tsScript === 'npm run typecheck') {
  pass('typescript-script', 'npm run verify:typescript is registered');
} else fail('typescript-script', 'npm run verify:typescript is not registered correctly');

const requiredOperatingGates = [
  ['verify:agent-contracts', 'node scripts/verify-agent-contracts.mjs'],
  ['verify:integrations', 'node scripts/verify-integrations.mjs'],
  ['verify:learning-protocol', 'node scripts/verify-learning-protocol.mjs'],
];
for (const [name, command] of requiredOperatingGates) {
  if (rootPackage.scripts?.[name] === command) pass(`script:${name}`, `${name} is registered`);
  else fail(`script:${name}`, `${name} is not registered correctly`);
  const gate = spawnSync('npm', ['run', name], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  if (gate.status === 0) pass(`gate:${name}`, `${name} passed`);
  else fail(`gate:${name}`, `${name} failed`);
}

if (exists('scripts/verify-typescript-version.mjs')) {
  const result = spawnSync('npm', ['run', 'verify:typescript'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status === 0) {
    pass('typescript-gate', 'TypeScript 7 native compiler + TypeScript 6 API alias gate passed');
    if (output.includes('[WARN] parser-compatibility')) {
      warn('typescript-parser-compatibility', 'TypeScript 6 API alias is absent; typescript-eslint compatibility follow-up is required');
    }
  } else fail('typescript-gate', 'TypeScript 7 version gate failed');
} else fail('typescript-gate', 'scripts/verify-typescript-version.mjs missing');

if (exists('.github/workflows')) {
  const workflows = fs.readdirSync(path.join(root, '.github/workflows')).filter((file) => /\.(yml|yaml)$/.test(file));
  const verifyWorkflow = workflows.find((file) => file === 'verify.yml');
  if (!verifyWorkflow) fail('github-actions', 'bounded verify.yml workflow is missing');
  else {
    const workflow = read(path.join('.github/workflows', verifyWorkflow));
    const bounded = workflow.includes('npm run verify:ci-smoke') &&
      workflow.includes('E2E_ALLOW_DATABASE_WRITES: \'0\'') &&
      !workflow.includes('services:') &&
      !workflow.includes('DATABASE_URL:');
    if (bounded) pass('github-actions', 'bounded CI workflow has no database or Redis service');
    else fail('github-actions', 'CI workflow is not bounded or includes database services');
  }
} else pass('github-actions', 'workflow directory removed');

for (const required of [
  'scripts/ci-self-hosted.mjs',
  'scripts/verify-next-phase.mjs',
    'scripts/verify-typescript-version.mjs', 'scripts/verify-crypto-runtime.mjs',
  'scripts/verify-e2e.mjs',
  'scripts/verify-secret-hygiene.mjs',
  'scripts/verify-agent-contracts.mjs',
  'scripts/verify-integrations.mjs',
  'scripts/verify-learning-protocol.mjs',
  'scripts/box-web-verify.mjs',
  'config/secrets/manifest.json',
  'config/agents/company-manifest.json',
  'config/integrations/manifest.json',
  'config/think/protocol.json',
  '.kilo/memory/snippets/company-agent-learning-protocol.md',
  '.kilo/memory/tokens/company-agent-learning.token',
]) {
  if (exists(required)) pass(`self-hosted:${required}`, 'present');
  else fail(`self-hosted:${required}`, 'missing');
}

const agentFiles = fs.readdirSync(path.join(root, '.kilo/agents')).filter((file) => file.endsWith('.agent'));
if (agentFiles.length < 3) fail('agent-registry', `${agentFiles.length} terminal agents found`);
else pass('agent-registry', `${agentFiles.length} terminal agents discovered`);
for (const dir of ['.kilo/memory', '.kilo/memory/decisions', '.kilo/memory/voicemails', '.kilo/memory/dthink']) {
  if (exists(dir)) pass(`memory:${dir}`, 'present');
  else fail(`memory:${dir}`, 'missing');
}

const selfHosted = read('scripts/ci-self-hosted.mjs');
if (selfHosted.includes('execSync(`node scripts/dthink-pipeline.mjs')) fail('self-hosted-ci:dthink', 'shell interpolation remains');
else pass('self-hosted-ci:dthink', 'argument-safe DTHINK invocation');

console.log(`\nOperating model: ${failures.length === 0 ? 'READY' : 'BLOCKED'}; ${warnings.length} warnings; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
