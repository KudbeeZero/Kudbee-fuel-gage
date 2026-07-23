/**
 * scripts/verify-agents.mjs
 * ---------------------------------------------------------------------------
 * CI gate: verify that agent modules load and expose expected exports.
 *
 * For each agent, we try `--help` first. If the process exits 0 and stdout
 * contains a known keyword we consider it healthy. Otherwise we fall back
 * to importing the module and checking for exported members.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const ROOT = new URL('.', import.meta.url).pathname;
const AGENTS_DIR = new URL('../services/agents/', import.meta.url).pathname;

const CHECKS = [
  {
    name: 'hermes',
    file: 'hermes.js',
    keywords: ['HERMES:AUDITOR', 'runAudit', 'archive_thought'],
    exports: ['hermes', 'runAudit', 'publishHeartbeat', 'archive_thought', 'query_system_topology']
  },
  {
    name: 'crucible',
    file: 'crucible.js',
    keywords: ['CRUCIBLE', 'runCrucibleCycle', 'startCrucibleScheduler'],
    exports: ['crucible', 'runCrucibleCycle', 'startCrucibleScheduler']
  },
  {
    name: 'worker',
    file: 'worker.ts',
    keywords: ['Worker', 'parseAgentPayload', 'evaluateAgentPayload'],
    exports: ['parseAgentPayload', 'evaluateAgentPayload', 'isAvailable', 'enqueueTask', 'listFailed']
  }
];

async function tryHelp(cli, args) {
  return new Promise((resolve) => {
    const proc = spawn(cli, [...args, '--help'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 8_000
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', () => resolve({ code: null, stdout: '', stderr: '' }));
  });
}

async function trySpawn(cli, args) {
  return new Promise((resolve) => {
    const proc = spawn(cli, args, {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 8_000
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', () => resolve({ code: null, stdout: '', stderr: '' }));
  });
}

async function importExports(filePath, names) {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const missing = names.filter((n) => !(n in mod));
    return { ok: missing.length === 0, missing, mod };
  } catch (err) {
    return { ok: false, missing: names, mod: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function resolveTsx() {
  try {
    const tsxPath = await import.meta.resolve('tsx/cli');
    return fileURLToPath(tsxPath);
  } catch {
    return null;
  }
}

async function main() {
  let passed = 0;
  let failed = 0;
  const report = [];
  const tsx = await resolveTsx();

  for (const check of CHECKS) {
    const fullPath = `${AGENTS_DIR}${check.file}`;
    if (!fs.existsSync(fullPath)) {
      report.push({ name: check.name, status: 'MISSING', detail: `File not found: ${fullPath}` });
      failed++;
      continue;
    }

    let result;
    if (check.file.endsWith('.ts')) {
      if (!tsx) {
        report.push({ name: check.name, status: 'SKIP', detail: 'tsx not available for TypeScript agents' });
        failed++;
        continue;
      }
      const res = await tryHelp(process.execPath, [tsx, fullPath]);
      if (res.code !== 0 || !check.keywords.some((k) => res.stdout.includes(k) || res.stderr.includes(k))) {
        const run = await trySpawn(process.execPath, [tsx, fullPath]);
        result = { code: run.code, stdout: run.stdout, stderr: run.stderr, phase: 'spawn' };
      } else {
        result = { code: res.code, stdout: res.stdout, stderr: res.stderr, phase: 'help' };
      }
    } else {
      const res = await tryHelp(process.execPath, [fullPath]);
      if (res.code !== 0 || !check.keywords.some((k) => res.stdout.includes(k) || res.stderr.includes(k))) {
        const run = await trySpawn(process.execPath, [fullPath]);
        result = { code: run.code, stdout: run.stdout, stderr: run.stderr, phase: 'spawn' };
      } else {
        result = { code: res.code, stdout: res.stdout, stderr: res.stderr, phase: 'help' };
      }
    }

    if (result.code === 0 && check.keywords.some((k) => result.stdout.includes(k) || result.stderr.includes(k))) {
      report.push({ name: check.name, status: 'PASS', detail: `exit 0, keywords found` });
      passed++;
      continue;
    }

    const importResult = await importExports(fullPath, check.exports);
    if (importResult.ok) {
      report.push({ name: check.name, status: 'PASS', detail: `exports verified: ${check.exports.join(', ')}`, fallback: true });
      passed++;
    } else {
      const detail = importResult.error
        ? `import failed: ${importResult.error}`
        : `missing exports: ${importResult.missing.join(', ')}`;
      report.push({ name: check.name, status: 'FAIL', detail, fallback: true });
      failed++;
    }
  }

  console.log('\n[VerifyAgents] Report:');
  for (const entry of report) {
    const tag = entry.status === 'PASS' ? '✅' : '❌';
    console.log(`${tag} ${entry.name}: ${entry.status} — ${entry.detail}`);
  }
  console.log(`\n[VerifyAgents] Passed ${passed}/${passed + failed}`);

  if (failed > 0) {
    console.error('[VerifyAgents] FAILED');
    process.exit(1);
  }
  process.exit(0);
}

main();
