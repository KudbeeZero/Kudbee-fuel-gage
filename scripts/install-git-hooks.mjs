/**
 * scripts/install-git-hooks.mjs
 * ---------------------------------------------------------------------------
 * Installs git hooks into .git/hooks/ for the repository.
 *
 * Hooks:
 *   pre-push  — runs verify-gates.mjs before every push
 *   pre-commit — (optional) runs lint on staged files
 *
 * Usage:
 *   node scripts/install-git-hooks.mjs
 *   node scripts/install-git-hooks.mjs --uninstall
 * ---------------------------------------------------------------------------
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const HOOK_DIR = join(process.cwd(), '.git', 'hooks');
const SCRIPT_DIR = join(process.cwd(), 'scripts', 'git-hooks');

if (!existsSync(SCRIPT_DIR)) {
  mkdirSync(SCRIPT_DIR, { recursive: true });
}

const flag = process.argv[2];
const hooks = {
  'pre-push': join(SCRIPT_DIR, 'pre-push.sh'),
};

if (flag === '--uninstall') {
  for (const [name, src] of Object.entries(hooks)) {
    const dest = join(HOOK_DIR, name);
    if (existsSync(dest)) {
      rmSync(dest);
      console.log(`  Removed ${name} hook`);
    }
  }
  process.exit(0);
}

for (const [name, src] of Object.entries(hooks)) {
  if (!existsSync(src)) {
    console.warn(`  Source hook ${src} not found — skipping ${name}`);
    continue;
  }
  const dest = join(HOOK_DIR, name);
  cpSync(src, dest);
  // Make executable
  try { require('child_process').execSync(`chmod +x ${dest}`); } catch {}
  console.log(`  Installed ${name} hook → ${dest}`);
}

console.log('\n  Git hooks installed. Run with --uninstall to remove.');
