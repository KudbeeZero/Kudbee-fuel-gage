#!/usr/bin/env node
/**
 * scripts/edisbox-deploy.mjs
 * ---------------------------------------------------------------------------
 * EDISBOX — Upstash Box integration for Heroku deploy verification.
 *
 * Runs an isolated HTTP health check inside an Upstash Box container
 * before promoting a deploy to production. This ensures the staging
 * environment is healthy without exposing credentials or requiring
 * local network access.
 *
 * Usage:
 *   node scripts/edisbox-deploy.mjs verify     Run staging health check
 *   node scripts/edisbox-deploy.mjs status     Show EDISBOX status
 *   node scripts/edisbox-deploy.mjs config     Show EDISBOX configuration
 *
 * Environment:
 *   UPSTASH_BOX_API_KEY    Required — Upstash Box API key
 *   STAGING_URL            Optional — staging URL (default: Heroku staging)
 * ---------------------------------------------------------------------------
 */

import { execSync } from 'node:child_process';

try { process.loadEnvFile('.env'); } catch {}

const STAGING_URL = (process.env.STAGING_URL || 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com').replace(/\/$/, '');
const API_KEY = process.env.UPSTASH_BOX_API_KEY;

const command = process.argv[2];

if (command === 'config') {
  console.log(JSON.stringify({
    stagingUrl: STAGING_URL,
    apiKeyConfigured: !!API_KEY,
    apiKeyPrefix: API_KEY ? API_KEY.slice(0, 8) + '...' : 'NOT SET',
    boxRuntime: 'node',
    timeout: 120000,
  }, null, 2));
  process.exit(0);
}

if (command === 'status') {
  if (!API_KEY) {
    console.log('EDISBOX_STATUS=NOT_CONFIGURED reason=missing UPSTASH_BOX_API_KEY');
    process.exit(0);
  }
  console.log('EDISBOX_STATUS=CONFIGURED');
  console.log(`  staging: ${STAGING_URL}`);
  console.log(`  key: ${API_KEY.slice(0, 8)}...`);
  process.exit(0);
}

if (command === 'verify' || command === 'check') {
  if (!API_KEY) {
    console.log('EDISBOX_VERIFY=SKIPPED reason=missing UPSTASH_BOX_API_KEY');
    console.log('  Set UPSTASH_BOX_API_KEY in .env or Heroku config to enable EDISBOX verification.');
    process.exit(0);
  }

  console.log(`EDISBOX_VERIFY=STARTING target=${STAGING_URL}`);

  try {
    const { Box } = await import('@upstash/box');
    const box = await Box.create({
      runtime: 'node',
      env: { STAGING_URL: STAGING_URL },
      timeout: 120_000,
    });

    try {
      const script = [
        'const target = process.env.STAGING_URL;',
        'const response = await fetch(target);',
        'const html = await response.text();',
        'const evidence = {',
        '  status: response.status,',
        '  bytes: html.length,',
        '  root: html.includes(\'id="root"\'),',
        '  timestamp: new Date().toISOString()',
        '};',
        'if (!response.ok || !evidence.root) process.exitCode = 1;',
        'console.log(JSON.stringify(evidence));',
      ].join(' ');

      const cmd = `node --input-type=module -e ${JSON.stringify(script)}`;
      const run = await box.exec.command(cmd);

      if (run.status === 'failed' || run.exitCode !== 0) {
        console.error('EDISBOX_VERIFY=FAIL remote HTTP check failed');
        process.exitCode = 1;
      } else {
        console.log('EDISBOX_VERIFY=PASS remote HTTP check completed');
        // Feed to DTHINK
        try {
          execSync(`node scripts/dthink-pipeline.mjs feed "deploy:edisbox" "EDISBOX verification passed — staging healthy at ${STAGING_URL}"`, { timeout: 5000 });
        } catch {}
      }
    } finally {
      await box.delete();
    }
  } catch (err) {
    console.error(`EDISBOX_VERIFY=ERROR ${err.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

console.log(`
EDISBOX — Upstash Box Deploy Verification
─────────────────────────────────────────
Usage:
  node scripts/edisbox-deploy.mjs verify    Run staging health check in Box
  node scripts/edisbox-deploy.mjs status    Show EDISBOX status
  node scripts/edisbox-deploy.mjs config    Show configuration

Environment:
  UPSTASH_BOX_API_KEY    Required — Upstash Box API key
  STAGING_URL            Optional — staging URL (default: Heroku staging)

How it works:
  1. Creates an isolated Upstash Box container
  2. Runs HTTP health check against staging URL
  3. Verifies response status and root element
  4. Records result in DTHINK pipeline
  5. Cleans up Box container
`);
