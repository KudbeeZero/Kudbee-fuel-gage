#!/usr/bin/env node
/** Audit PR, pipeline, SOP, agent, and memory operating contracts. */
import fs from 'node:fs';
import path from 'node:path';

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
for (const required of ['phase-governor', 'verify-next-phase', 'git diff --check', 'review', 'rollback']) {
  if (pr.includes(required)) pass(`pr:${required}`, 'documented');
  else fail(`pr:${required}`, 'missing from PR workflow');
}

for (const workflow of ['.github/workflows/verify.yml', '.github/workflows/deploy.yml', '.github/workflows/deploy-staging.yml']) {
  if (!exists(workflow)) { fail(`workflow:${workflow}`, 'missing'); continue; }
  const content = read(workflow);
  for (const required of ['npm ci', 'npm run typecheck', 'verify-e2e']) {
    if (content.includes(required)) pass(`${workflow}:${required}`, 'present');
    else warn(`${workflow}:${required}`, 'not present in this workflow');
  }
  if (content.includes('kudbee-fuel-gage-staging.herokuapp.com')) fail(`${workflow}:staging-host`, 'obsolete guessed hostname');
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
