#!/usr/bin/env node
/**
 * scripts/dyno-manager.mjs — EEF-1 Elastic Engineering Factory
 * Provisions and destroys Heroku workers on demand.
 * Workers exist only while performing useful work.
 */

const APP = process.env.HEROKU_APP || process.argv[2] || 'kudbee-fuel-gage';
const API_KEY = process.env.HEROKU_API_KEY;
const BASE_URL = 'https://api.heroku.com';

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/vnd.heroku+json; version=3', 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}/apps/${APP}${path}`, opts);
  return res.json();
}

async function status() {
  const formation = await api('/formation');
  console.log(`APP: ${APP}`);
  for (const f of formation) console.log(`  ${f.type.padEnd(20)} qty:${f.quantity}  size:${f.size}`);
}

async function scale(worker, qty) {
  const result = await api(`/formation/${worker}`, 'PATCH', { quantity: Number(qty) });
  console.log(`Scaled ${worker} → ${result.quantity} (size: ${result.size})`);
}

async function provision(mission) {
  console.log(`Provisioning worker for: ${mission}`);
  await scale('monitor-worker', 1);
  await scale('hermes-worker', 1);
  console.log('Workers provisioned. Execute mission, then run: node scripts/dyno-manager.mjs teardown');
}

async function teardown() {
  for (const w of ['monitor-worker', 'hermes-worker', 'sentinel']) await scale(w, 0);
  console.log('All workers terminated. Idle cost: $0.');
}

const cmd = process.argv[3] || process.argv[2] || 'status';
(async () => {
  if (cmd === 'status') await status();
  else if (cmd === 'scale') await scale(process.argv[3] || process.argv[4] || 'unknown', process.argv[4] || process.argv[5] || 1);
  else if (cmd === 'provision') await provision(process.argv.slice(3).join(' ') || 'unknown-mission');
  else if (cmd === 'teardown') await teardown();
  else if (cmd === 'up') { await scale('monitor-worker', 1); await scale('hermes-worker', 1); await scale('sentinel', 1); console.log('All workers scaled to 1'); }
  else console.log('Usage: dyno-manager.mjs <app> status|scale|provision|teardown|up');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
