#!/usr/bin/env node
/** Check integration declarations without calling provider APIs or printing values. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

try { process.loadEnvFile('.env'); } catch {}

const root = process.cwd();
const manifestPath = path.join(root, 'config', 'integrations', 'manifest.json');
const mcpPath = path.join(root, '.mcp.json');
const require = createRequire(path.join(root, 'package.json'));
const failures = [];
const skips = [];
const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const skip = (id, detail) => {
  skips.push(`${id}: ${detail}`);
  console.warn(`[SKIP] ${id}: ${detail}`);
};
const fail = (id, detail) => {
  failures.push(`${id}: ${detail}`);
  console.error(`[FAIL] ${id}: ${detail}`);
};
const exists = (file) => fs.existsSync(path.join(root, file));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail('manifest', `cannot read integration manifest: ${error.message}`);
}

if (manifest?.policy?.providerWriteApisCalledByVerifier !== false) {
  fail('policy', 'providerWriteApisCalledByVerifier must be false');
}
if (manifest?.policy?.valuesPrintedToLogs !== false || manifest?.policy?.presenceChecksPrintNamesOnly !== true) {
  fail('policy', 'secret-safe logging policy is incomplete');
}

const integrations = Array.isArray(manifest?.integrations) ? manifest.integrations : [];
const ids = new Set();
for (const integration of integrations) {
  if (!integration || typeof integration !== 'object' || !nonEmpty(integration.id) || ids.has(integration.id)) {
    fail('manifest-id', `missing or duplicate integration id: ${integration?.id || '(missing)'}`);
    continue;
  }
  ids.add(integration.id);
  for (const field of ['name', 'readCapabilities', 'writeCapabilities', 'secretSafeRules']) {
    const valid = ['readCapabilities', 'writeCapabilities', 'secretSafeRules'].includes(field)
      ? Array.isArray(integration[field]) && integration[field].length > 0
      : nonEmpty(integration[field]);
    if (!valid) fail(`integration:${integration.id}`, `missing ${field}`);
  }
  if (!Array.isArray(integration.commands) || !Array.isArray(integration.packages) || !Array.isArray(integration.environment)) {
    fail(`integration:${integration.id}`, 'commands, packages, and environment must be arrays');
    continue;
  }
  const secretValuePattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:ghp_|github_pat_|sk-(?:proj|ant)-|gsk_|AIza)[A-Za-z0-9_-]{12,}|(?:postgres|postgresql|redis|rediss):\/\/[^\s:@/]+:[^\s@]+@/;
  if (secretValuePattern.test(JSON.stringify(integration))) fail(`integration:${integration.id}`, 'possible secret value in integration metadata');

  for (const command of integration.commands) {
    const commandText = typeof command === 'string' ? command : command?.name;
    const executable = commandText?.trim().split(/\s+/)[0];
    if (!executable) {
      fail(`command:${integration.id}`, 'command name is missing');
      continue;
    }
    try {
      require('node:child_process').execFileSync('which', [executable], { stdio: 'ignore', timeout: 5_000 });
      pass(`command:${integration.id}:${executable}`, 'available');
    } catch {
      skip(`command:${integration.id}:${executable}`, 'optional capability unavailable (command not installed)');
    }
  }
  for (const packageEntry of integration.packages) {
    const packageName = typeof packageEntry === 'string' ? packageEntry : packageEntry?.name;
    const optional = typeof packageEntry === 'string' ? Boolean(integration.optional) : packageEntry?.optional !== false;
    if (!nonEmpty(packageName)) {
      fail(`package:${integration.id}`, 'package name is missing');
      continue;
    }
    try {
      await import(packageName);
      pass(`package:${integration.id}:${packageName}`, 'available');
    } catch {
      if (optional) skip(`package:${integration.id}:${packageName}`, 'optional capability unavailable (package not installed)');
      else fail(`package:${integration.id}:${packageName}`, 'required package is not installed');
    }
  }
  for (const environment of integration.environment) {
    const name = typeof environment === 'string' ? environment : environment?.name;
    const optional = typeof environment === 'string' ? true : environment?.optional !== false;
    if (!nonEmpty(name)) {
      fail(`environment:${integration.id}`, 'environment name is missing');
      continue;
    }
    if (process.env[name]) pass(`environment:${integration.id}:${name}`, 'configured (value withheld)');
    else if (optional) skip(`environment:${integration.id}:${name}`, 'optional capability unavailable (name not configured)');
    else fail(`environment:${integration.id}:${name}`, 'required environment name is not configured');
  }
}

if (!exists('.mcp.json')) {
  fail('mcp-config', 'missing .mcp.json');
} else {
  try {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const server = mcp.mcpServers?.['upstash-redis'];
    const expected = manifest?.mcpCapabilityBoundaries?.['upstash-redis'];
    if (!server || server.command !== 'npx' || JSON.stringify(server.args) !== JSON.stringify(['-y', '@upstash/redis-mcp'])) {
      fail('mcp-config', 'upstash-redis must use the existing npx @upstash/redis-mcp server definition');
    } else if (expected?.launch !== 'npx -y @upstash/redis-mcp') {
      fail('mcp-boundary', 'upstash-redis launch boundary does not match .mcp.json');
    } else {
      pass('mcp-config', 'existing Upstash Redis MCP server is declared without additional server commands');
    }
  } catch (error) {
    fail('mcp-config', `invalid .mcp.json: ${error.message}`);
  }
}

console.log(`\nIntegrations: ${failures.length === 0 ? 'READY' : 'BLOCKED'}; ${skips.length} optional skips; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
