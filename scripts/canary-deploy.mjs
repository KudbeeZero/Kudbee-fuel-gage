/**
 * scripts/canary-deploy.mjs
 *
 * Staged Canary Rollout Pipeline — promotes a Heroku slug through
 * review → staging → production, gated by health checks at each stage.
 *
 * Usage:
 *   node scripts/canary-deploy.mjs promote staging
 *   node scripts/canary-deploy.mjs promote production
 *   node scripts/canary-deploy.mjs rollback production
 *
 * Requires HEROKU_API_KEY in env. Falls back to git-push if no API key.
 * --------------------------------------------------------------------------
 * Stage map:
 *   staging    → https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com
 *   production → https://kudbee-fuel-gage-330ade653a62.herokuapp.com
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const HEROKU_API_KEY = process.env.HEROKU_API_KEY || '';
const ROLLBACK_DIR = join(process.cwd(), '.kilo', 'deploy');
const ROLLBACK_FILE = join(ROLLBACK_DIR, 'last-known-good.json');

const STAGES = {
  staging: {
    app: 'kudbee-fuel-gage-staging',
    url: 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com',
  },
  production: {
    app: 'kudbee-fuel-gage',
    url: 'https://kudbee-fuel-gage-330ade653a62.herokuapp.com',
  },
};

function gitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'main';
  }
}

async function runHealthGate(url, watch) {
  const cmd = `node scripts/health-gate.mjs ${url}` + (watch ? ` --watch ${watch}` : '');
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 120_000 });
    return true;
  } catch {
    return false;
  }
}

function writeRollbackRecord(stage, sha, branch) {
  try {
    if (!existsSync(ROLLBACK_DIR)) mkdirSync(ROLLBACK_DIR, { recursive: true });
    writeFileSync(ROLLBACK_FILE, JSON.stringify({
      stage,
      sha,
      branch,
      timestamp: new Date().toISOString(),
      app: STAGES[stage]?.app || 'unknown',
    }, null, 2));
  } catch {}
}

function getRollbackRecord() {
  try {
    if (!existsSync(ROLLBACK_FILE)) return null;
    return JSON.parse(readFileSync(ROLLBACK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function herokuDeploy(stage) {
  const { app, url } = STAGES[stage];
  if (!app) { console.error(`[Canary] Unknown stage: ${stage}`); return false; }

  const sha = gitHash();
  const branch = getBranch();
  console.log(`[Canary] Deploying ${sha} (${branch}) → ${stage} (${app})`);

  // Heroku git push (with API key auth if available)
  const remote = HEROKU_API_KEY
    ? `https://:${HEROKU_API_KEY}@git.heroku.com/${app}.git`
    : `https://git.heroku.com/${app}.git`;

  try {
    execSync(`git push -f ${remote} HEAD:main`, {
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (e) {
    console.error(`[Canary] Push failed:`, e.stderr?.toString().slice(-500) || e.message);
    return false;
  }

  console.log(`[Canary] Push succeeded. Waiting for release phase …`);
  await delay(10_000);

  // Run health gate with watch
  console.log(`[Canary] Running health gate on ${url} …`);
  const healthy = await runHealthGate(url, '45s');

  if (healthy) {
    console.log(`[Canary] GATE PASS — ${stage} is healthy.`);
    writeRollbackRecord(stage, sha, branch);
    return true;
  } else {
    console.error(`[Canary] GATE BLOCKED — rolling back ${stage} …`);
    await rollback(stage);
    return false;
  }
}

async function rollback(stage) {
  const record = getRollbackRecord();
  if (!record || record.stage !== stage) {
    console.error(`[Canary] No rollback record for ${stage}. Cannot auto-rollback.`);
    console.error(`[Canary] Manual rollback: deploy the previous commit manually.`);
    return;
  }

  const { app } = STAGES[stage];
  console.log(`[Canary] Rolling back to ${record.sha} (${record.branch}) …`);

  try {
    execSync(`git checkout ${record.sha} --detach`, { stdio: 'pipe', timeout: 10_000 });
    const remote = HEROKU_API_KEY
      ? `https://:${HEROKU_API_KEY}@git.heroku.com/${app}.git`
      : `https://git.heroku.com/${app}.git`;
    execSync(`git push -f ${remote} HEAD:main`, {
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    execSync(`git checkout -`, { stdio: 'pipe', timeout: 5_000 });
    console.log(`[Canary] Rollback complete. ${stage} is on ${record.sha}.`);
  } catch (e) {
    console.error(`[Canary] Rollback failed:`, e.stderr?.toString().slice(-500) || e.message);
  }
}

function status() {
  console.log('[Canary] Deploy Pipeline Status');
  for (const [name, stage] of Object.entries(STAGES)) {
    const record = getRollbackRecord();
    const isCurrent = record?.stage === name;
    console.log(`  ${name.padEnd(12)} ${stage.url} ${isCurrent ? `(last good: ${record.sha})` : '(unknown)'}`);
  }

  try {
    console.log(`\n  Current: ${gitHash()} (${getBranch()})`);
  } catch {}
}

// ── CLI ────────────────────────────────────────────────────────────────────

const [cmd, target] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'promote':
      if (!target || !STAGES[target]) {
        console.error('Usage: node scripts/canary-deploy.mjs promote <staging|production>');
        process.exit(1);
      }
      const ok = await herokuDeploy(target);
      process.exit(ok ? 0 : 1);

    case 'rollback':
      if (!target || !STAGES[target]) {
        console.error('Usage: node scripts/canary-deploy.mjs rollback <staging|production>');
        process.exit(1);
      }
      await rollback(target);
      process.exit(0);

    case 'status':
      status();
      process.exit(0);

    case 'gate':
      if (!target) {
        // Run gate against all known stages
        for (const [name, stage] of Object.entries(STAGES)) {
          console.log(`\n── Gate: ${name} ──`);
          await runHealthGate(stage.url);
        }
      } else {
        const stage = STAGES[target];
        if (!stage) { console.error(`Unknown stage: ${target}`); process.exit(1); }
        await runHealthGate(stage.url);
      }
      break;

    default:
      console.log('Canary Deploy Pipeline');
      console.log('  promote <stage>     Deploy and gate');
      console.log('  rollback <stage>    Rollback to last good');
      console.log('  gate [stage]        Run health gate');
      console.log('  status              Show pipeline status');
      console.log(`\n  Stages: staging, production`);
      console.log(`  Current: ${gitHash()} (${getBranch()})`);
      break;
  }
}

main().catch((e) => {
  console.error('[Canary] FATAL:', e.message);
  process.exit(2);
});
