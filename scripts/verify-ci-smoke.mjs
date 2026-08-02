#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const pass = (name, detail) => console.log(`[PASS] ${name}: ${detail}`);
const fail = (name, detail) => {
  failures.push(name);
  console.error(`[FAIL] ${name}: ${detail}`);
};

const dist = path.join(root, 'apps/web/dist');
const indexPath = path.join(dist, 'index.html');
if (fs.existsSync(indexPath)) pass('web-artifact', 'apps/web/dist/index.html exists');
else fail('web-artifact', 'web build artifact is missing');

const index = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
if (/<script[^>]+src=/.test(index) && /id=["']root["']/.test(index)) pass('web-shell', 'built shell has root and script entry');
else fail('web-shell', 'built shell is incomplete');

const budget = Number(process.env.CI_MUTATION_BUDGET || 20);
if (Number.isInteger(budget) && budget > 0 && budget <= 50) pass('ci-budget', `mutation budget bounded at ${budget}`);
else fail('ci-budget', 'CI_MUTATION_BUDGET must be an integer from 1 through 50');

if (process.env.E2E_ALLOW_DATABASE_WRITES === '1') {
  console.warn('[WARN] database-writing E2E explicitly enabled; smoke remains build-only');
} else {
  pass('database-safety', 'no database-writing E2E enabled');
}

console.log(`\nCI smoke: ${failures.length ? 'BLOCKED' : 'READY'}; database writes: none`);
if (failures.length) process.exitCode = 1;
