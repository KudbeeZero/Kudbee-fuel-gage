#!/usr/bin/env node
/** Validate discovered terminal agents against the company metadata contract. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const agentDir = path.join(root, '.kilo', 'agents');
const manifestPath = path.join(root, 'config', 'agents', 'company-manifest.json');
const integrationsPath = path.join(root, 'config', 'integrations', 'manifest.json');
const failures = [];

const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const fail = (id, detail) => {
  failures.push(`${id}: ${detail}`);
  console.error(`[FAIL] ${id}: ${detail}`);
};
const requiredFields = [
  'id',
  'name',
  'department',
  'job',
  'directive',
  'schedule',
  'memoryId',
  'allowedIntegrations',
  'writeAuthority',
  'approvalBoundary',
];
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(agentDir)) fail('agent-directory', 'missing .kilo/agents');
if (!fs.existsSync(manifestPath)) fail('company-manifest', 'missing config/agents/company-manifest.json');
if (!fs.existsSync(integrationsPath)) fail('integration-manifest', 'missing config/integrations/manifest.json');

let manifest;
let integrations;
try {
  if (fs.existsSync(manifestPath)) manifest = readJson(manifestPath);
  if (fs.existsSync(integrationsPath)) integrations = readJson(integrationsPath);
} catch (error) {
  fail('manifest-json', error.message);
}

const files = fs.existsSync(agentDir)
  ? fs.readdirSync(agentDir).filter((file) => file.endsWith('.agent')).sort()
  : [];
const records = Array.isArray(manifest?.agents) ? manifest.agents : [];
const integrationIds = new Set((integrations?.integrations || []).map((entry) => entry.id));
const recordById = new Map();

for (const record of records) {
  if (!record || typeof record !== 'object') {
    fail('manifest-record', 'record must be an object');
    continue;
  }
  if (!nonEmpty(record.id) || recordById.has(record.id)) {
    fail('manifest-id', `missing or duplicate stable id: ${record.id || '(missing)'}`);
  } else {
    recordById.set(record.id, record);
  }
}

const secretValuePattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:ghp_|github_pat_|sk-(?:proj|ant)-|gsk_|AIza)[A-Za-z0-9_-]{12,}|(?:postgres|postgresql|redis|rediss):\/\/[^\s:@/]+:[^\s@]+@/;
if (manifest && secretValuePattern.test(JSON.stringify(manifest))) {
  fail('metadata-secrets', 'possible secret value found in company manifest');
} else if (manifest) {
  pass('metadata-secrets', 'company manifest contains metadata only');
}

for (const file of files) {
  const id = path.basename(file, '.agent');
  const record = recordById.get(id);
  if (!record) {
    fail(`agent:${id}`, 'no company manifest record');
    continue;
  }
  if (record.id !== id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
    fail(`agent:${id}`, 'stable id must equal the filename stem and use kebab case');
  }
  for (const field of requiredFields) {
    const value = record[field];
    const valid = ['allowedIntegrations'].includes(field)
      ? Array.isArray(value) && value.length > 0 && value.every(nonEmpty)
      : ['writeAuthority', 'approvalBoundary'].includes(field)
        ? value && typeof value === 'object'
        : nonEmpty(value);
    if (!valid) fail(`agent:${id}`, `missing required field ${field}`);
  }
  for (const integration of record.allowedIntegrations || []) {
    if (!integrationIds.has(integration)) fail(`agent:${id}`, `unknown integration ${integration}`);
  }

  const source = fs.readFileSync(path.join(agentDir, file), 'utf8');
  const sourceMemory = source.match(/^memoryId:\s*(\S+)\s*$/m)?.[1];
  if (sourceMemory && sourceMemory !== record.memoryId) {
    fail(`agent:${id}`, `manifest memoryId does not match source metadata (${sourceMemory})`);
  }
  const sourceId = source.match(/^id:\s*(\S+)\s*$/m)?.[1];
  if (sourceId && sourceId !== record.id) fail(`agent:${id}`, 'manifest id does not match source metadata');
  if (secretValuePattern.test(source)) fail(`agent:${id}`, 'possible secret value found in agent metadata');
  pass(`agent:${id}`, `${record.name}; ${record.department}; schedule=${record.schedule}; memory=${record.memoryId}`);
}

for (const record of records) {
  if (!files.includes(`${record.id}.agent`)) fail(`manifest:${record.id}`, 'record has no discovered .agent file');
}
if (records.length !== files.length) fail('agent-count', `manifest has ${records.length} records for ${files.length} discovered agents`);
else pass('agent-count', `${files.length} discovered agents have stable company records`);

console.log(`\nAgent contracts: ${failures.length === 0 ? 'READY' : 'BLOCKED'}; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
