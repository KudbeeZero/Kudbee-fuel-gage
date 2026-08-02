#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const FAIL = '\x1b[31m✗\x1b[0m';
const PASS = '\x1b[32m✓\x1b[0m';

let errors = 0;
const fail = (msg) => { console.log(`  ${FAIL} ${msg}`); errors++; };
const pass = (msg) => { console.log(`  ${PASS} ${msg}`); };

const tryRead = (path) => { try { return readFileSync(join(ROOT, path), 'utf8'); } catch { return null; } };
const tryExec = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim(); } catch { return null; } };

console.log('\n═══════════════════════════════════════');
console.log('  VERIFY:QUICK — Pre-Push Gate');
console.log('═══════════════════════════════════════\n');

const missionLock = tryRead('.kilo/mission-lock.json');
if (!missionLock) fail('mission-lock.json missing');
else if (missionLock.includes('<<<<<<<')) fail('MERGE CONFLICT in mission-lock.json');
else { try { JSON.parse(missionLock); pass('mission-lock.json valid'); } catch { fail('mission-lock.json invalid JSON'); } }

if (existsSync(join(ROOT, '.kilo'))) {
  const checkDir = (dir) => {
    try {
      for (const f of readdirSync(dir)) {
        const fp = join(dir, f);
        if (f === 'node_modules') continue;
        try { if (readFileSync(fp, 'utf8').includes('<<<<<<<')) { fail(`MERGE CONFLICT in ${fp.replace(ROOT, '')}`); break; } } catch {}
      }
    } catch {}
  };
  checkDir(join(ROOT, '.kilo'));
  if (!missionLock?.includes('<<<<<<<')) pass('no merge conflicts in .kilo/');
}

const branch = tryExec('git branch --show-current') ?? 'unknown';
if (branch === 'main' || branch === 'master') fail(`Pushing to ${branch} — use a feature branch`);
else pass(`branch: ${branch}`);

const objLock = tryRead('.kilo/objective-lock.json');
if (!objLock) console.log('  \x1b[33m⚠\x1b[0m objective-lock.json missing');
else { try { JSON.parse(objLock); pass('objective-lock.json valid'); } catch { fail('objective-lock.json invalid JSON'); } }

if (existsSync(join(ROOT, 'config', 'pr', 'stack.json'))) {
  try { JSON.parse(readFileSync(join(ROOT, 'config', 'pr', 'stack.json'), 'utf8')); pass('stack.json valid'); } catch { fail('stack.json invalid JSON'); }
}

const dirty = tryExec('git status --short');
if (dirty) console.log(`  \x1b[33m⚠\x1b[0m ${dirty.split('\n').length} uncommitted files`);

// Governance check
const govResult = tryExec('node scripts/protocol-guard.mjs status');
if (govResult && govResult.includes('FAIL')) fail('protocol-guard status: FAIL — governance violation');
else pass('protocol-guard status: PASS');

console.log(`\n═══════════════════════════════════════`);
if (errors === 0) {
  console.log(`  ${PASS} All checks passed — safe to push`);
  console.log(`═══════════════════════════════════════\n`);
  process.exit(0);
} else {
  console.log(`  ${FAIL} ${errors} blocker(s) found — fix before push`);
  console.log(`═══════════════════════════════════════\n`);
  process.exit(1);
}
