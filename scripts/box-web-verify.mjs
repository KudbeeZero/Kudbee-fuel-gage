#!/usr/bin/env node
/** Run an HTTP-level staging check inside an Upstash Box when configured. */
try { process.loadEnvFile('.env'); } catch {}

const strict = process.argv.includes('--strict');
const target = (process.env.STAGING_URL || 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com').replace(/\/$/, '');
const apiKey = process.env.UPSTASH_BOX_API_KEY;

if (!apiKey) {
  console.log(`BOX_WEB_VERIFY=SKIPPED reason=missing UPSTASH_BOX_API_KEY target=${target}`);
  if (strict) process.exitCode = 2;
  process.exit();
}

const { Box } = await import('@upstash/box');
const box = await Box.create({ runtime: 'node', env: { STAGING_URL: target }, timeout: 120_000 });
try {
  const script = [
    'const target = process.env.STAGING_URL;',
    'const response = await fetch(target);',
    'const html = await response.text();',
    'const evidence = { status: response.status, bytes: html.length, root: html.includes(\'id="root"\') };',
    'if (!response.ok || !evidence.root) process.exitCode = 1;',
    'console.log(JSON.stringify(evidence));',
  ].join(' ');
  const command = `node --input-type=module -e ${JSON.stringify(script)}`;
  const run = await box.exec.command(command);
  if (run.status === 'failed' || run.exitCode !== 0) {
    console.error('BOX_WEB_VERIFY=FAIL remote HTTP check failed');
    process.exitCode = 1;
  } else {
    console.log('BOX_WEB_VERIFY=PASS remote HTTP check completed (response details withheld)');
  }
} finally {
  await box.delete();
}
