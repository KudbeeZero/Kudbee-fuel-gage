/**
 * scripts/verify-agents.mjs
 * ---------------------------------------------------------------------------
 * CI verification for existing agent modules.
 *
 * Ensures hermes.js, crucible.js, and worker.ts can be loaded and expose
 * their expected exports. Does NOT create new agents.
 * ---------------------------------------------------------------------------
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const AGENTS_DIR = new URL('../services/agents', import.meta.url).pathname;
const TSX_PATH = require.resolve('tsx/cli');

let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

async function checkModule(label, absolutePath, requiredExports) {
  try {
    const mod = require(absolutePath);
    const exported = mod && mod.default ? mod.default : mod;
    const hasAll = requiredExports.every((key) => key in exported);
    assert(hasAll, `${label} exports ${requiredExports.join(', ')}`);
  } catch (err) {
    assert(false, `${label} loadable: ${err.message}`);
  }
}

async function checkWorkerCompiles() {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [TSX_PATH, '--check', `${AGENTS_DIR}/worker.ts`], {
      cwd: AGENTS_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const ok = code === 0;
      assert(ok, 'worker.ts compiles via tsx --check');
      assert(
        stdout.includes('Worker') || stderr.includes('Worker') || stdout.includes('worker') || stderr.includes('worker') || (!stdout && !stderr),
        'worker.ts produced worker-related output or empty clean compile'
      );
      resolve();
    });

    proc.on('error', (err) => {
      assert(false, `worker.ts tsx spawn: ${err.message}`);
      resolve();
    });
  });
}

async function run() {
  console.log('[VerifyAgents] Checking agent modules...\n');

  await checkModule('hermes.js', `${AGENTS_DIR}/hermes.js`, [
    'runAudit', 'publishHeartbeat', 'agentId', 'prefix'
  ]);

  await checkModule('crucible.js', `${AGENTS_DIR}/crucible.js`, [
    'runCrucibleCycle', 'startCrucibleScheduler', 'MAX_CYCLES_PER_BOOT'
  ]);

  await checkWorkerCompiles();

  console.log(`\n[VerifyAgents] Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
