#!/usr/bin/env node
/** Validate the company-agent learning protocol and its memory artifacts. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protocolPath = path.join(root, 'config', 'think', 'protocol.json');
const snippetPath = path.join(root, '.kilo', 'memory', 'snippets', 'company-agent-learning-protocol.md');
const tokenPath = path.join(root, '.kilo', 'memory', 'tokens', 'company-agent-learning.token');
const failures = [];
const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const fail = (id, detail) => {
  failures.push(`${id}: ${detail}`);
  console.error(`[FAIL] ${id}: ${detail}`);
};
const requiredSteps = [
  'recall-memory',
  'declare-preconditions',
  'execute-bounded-job',
  'collect-evidence',
  'receive-quality-signal',
  'mint-think-token',
  'feed-dthink',
  'update-agent-memory',
  'create-bounded-follow-up',
];
const secretValuePattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:ghp_|github_pat_|sk-(?:proj|ant)-|gsk_|AIza)[A-Za-z0-9_-]{12,}|(?:postgres|postgresql|redis|rediss):\/\/[^\s:@/]+:[^\s@]+@/;

let protocol;
try {
  protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));
} catch (error) {
  fail('protocol-json', `cannot read protocol: ${error.message}`);
}
const snippet = fs.existsSync(snippetPath) ? fs.readFileSync(snippetPath, 'utf8') : '';
const token = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8') : '';

const stepIds = new Set((protocol?.steps || []).map((step) => step.id));
for (const step of requiredSteps) {
  if (stepIds.has(step)) pass(`step:${step}`, 'declared');
  else fail(`step:${step}`, 'missing from protocol');
}
for (const field of ['secretsInThinkOrDthink', 'autonomousProductionOrDestructiveChanges', 'unverifiedSelfModification']) {
  if (protocol?.safetyRules?.[field] === false) pass(`safety:${field}`, 'forbidden');
  else fail(`safety:${field}`, 'must be explicitly false');
}
for (const artifact of [snippetPath, tokenPath]) {
  if (fs.existsSync(artifact)) pass(`artifact:${path.relative(root, artifact)}`, 'present');
  else fail(`artifact:${path.relative(root, artifact)}`, 'missing');
}
const combined = `${JSON.stringify(protocol || {})}\n${snippet}\n${token}`;
if (secretValuePattern.test(combined)) fail('secret-hygiene', 'possible credential value found in protocol artifacts');
else pass('secret-hygiene', 'protocol artifacts contain names and rules only');
for (const phrase of ['recall relevant memory', 'bounded job', 'quality signal', 'THINK token', 'DTHINK', 'bounded follow-up']) {
  if (combined.toLowerCase().includes(phrase.toLowerCase())) pass(`content:${phrase}`, 'represented');
  else fail(`content:${phrase}`, 'missing');
}
if (protocol?.tokenContract?.initialStatus === 'PENDING_APPROVAL') pass('promotion-boundary', 'tokens start pending approval');
else fail('promotion-boundary', 'initial token status must be PENDING_APPROVAL');

console.log(`\nLearning protocol: ${failures.length === 0 ? 'READY' : 'BLOCKED'}; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
