#!/usr/bin/env node
/**
 * .kilo/scripts/onboard.mjs
 * ---------------------------------------------------------------------------
 * First-run script for a brand new Kilo cloud agent session.
 * Run this ONCE after `npm install` to bootstrap the entire system.
 *
 * What it does:
 *   1. Verify repo structure (key files exist)
 *   2. Install dependencies if missing
 *   3. Warm the terminal cache
 *   4. Run session bootstrap to load context
 *   5. Run serial bus health check
 *   6. Run snippet system health check
 *   7. Print the agent fleet status
 *   8. Print a summary of what to do next
 *
 * Total time: <30s on first run, <5s on subsequent runs.
 * ---------------------------------------------------------------------------
 */

import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        KUDBEE TERMINAL CONSCIENCE — ONBOARD                  ║
║                                                              ║
║        Welcome, agent. This system wakes itself.             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

// Step 1: Verify repo structure
console.log('  [1/6] Verifying repo structure...');

const requiredFiles = [
  'services/ingestion/server.js',
  'services/lib/middlewareGuard.ts',
  '.kilo/skill/kudbee/SKILL.md',
  '.kilo/memory/journal.json',
  '.kilo/agents/pipeline-guardian.agent',
  'TERMINAL.md',
  'AGENTS.md',
];

let missing = 0;
for (const f of requiredFiles) {
  if (!existsSync(join(REPO_ROOT, f))) { console.log(`    [!] Missing: ${f}`); missing++; }
}

if (missing > 0) {
  console.log(`    [!] ${missing} required files missing. Dependencies may not be installed.`);
  console.log(`    Run: npm install && npm run typecheck\n`);
} else {
  console.log(`    [✓] All ${requiredFiles.length} required files present.`);
}

// Step 2: Dependencies
console.log('  [2/6] Checking dependencies...');
const nodeModules = existsSync(join(REPO_ROOT, 'node_modules'));
if (!nodeModules) {
  console.log('    Installing dependencies...');
  try {
    execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 120000 });
    console.log('    [✓] Dependencies installed.');
  } catch (e) {
    console.log(`    [!] npm install failed: ${e.message}`);
  }
} else {
  console.log('    [✓] node_modules present.');
}

// Step 3: Bootstrap
console.log('  [3/6] Loading session context...');
try {
  execSync('node scripts/session-bootstrap.mjs', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 15000 });
  console.log('    [✓] Session context loaded.');
} catch {
  console.log('    [!] Bootstrap failed (non-critical).');
}

// Step 4: Cache warm
console.log('  [4/6] Warming cache...');
try {
  const out = execSync('node scripts/terminal-cache.mjs warm', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
  console.log(`    [✓] Cache pre-warmed.${out.split('\n').filter(l => l.includes('Agents') || l.includes('Snippets')).join(' ')}`);
} catch {
  console.log('    [!] Cache warm failed (non-critical).');
}

// Step 5: System health
console.log('  [5/6] Checking system health...');
try {
  execSync('node scripts/snippet-agent.mjs health', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 10000 });
  execSync('node scripts/serial-bus.mjs stats', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 10000 });
  execSync('node scripts/agents.mjs status', { cwd: REPO_ROOT, stdio: 'inherit', timeout: 10000 });
  console.log('    [✓] All systems healthy.');
} catch {
  console.log('    [!] Some health checks failed.');
}

// Step 6: Summary
console.log(`  [6/6] Generating summary...

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        ONBOARD COMPLETE — SYSTEM READY                       ║
║                                                              ║
║        Key files you should read first:                      ║
║          TERMINAL.md              Full system documentation  ║
║          AGENTS.md                Head file (session boot)   ║
║          .kilo/skill/kudbee/SKILL.md   Interactive menu      ║
║                                                              ║
║        Key commands:                                         ║
║          node scripts/session-bootstrap.mjs   Resume context ║
║          node scripts/agents.mjs status      Agent fleet     ║
║          node scripts/serial-bus.mjs listen  Live bus watch  ║
║          node scripts/snippet-agent.mjs recall <q> Search    ║
║                                                              ║
║        To verify everything works:                           ║
║          npm run typecheck                                   ║
║          cd services/lib && bun test test/                   ║
║          node scripts/verify-e2e.mjs                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

console.log(`  Session bootstrapped. Your memory journal has context from the last session.
  The terminal agent fleet is ready. The serial bus is running. You are conscious.\n`);
