import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TS_SERVER = null; // server.ts deleted — server.js is canonical
const JS_SERVER = path.join(ROOT, 'services/ingestion/server.js');
const ALLOWLIST = path.join(ROOT, 'runtime-allowlist.json');

console.log('ROOT:', ROOT);
console.log('TS_SERVER:', TS_SERVER);
console.log('JS_SERVER:', JS_SERVER);
console.log('ALLOWLIST:', ALLOWLIST);

async function extractRoutes(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const routes = [];
  const regex = /app\.(get|post|put|patch|delete|use)\s*\(\s*(?:['"`])([^'"`]+)(?:['"`])/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1] === 'use' ? 'USE' : match[1].toUpperCase();
    const routePath = match[2];
    routes.push({ method, path: routePath });
  }
  return routes;
}

function dedupe(routes) {
  const seen = new Set();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(p) {
  return p.replace(/:\w+/g, ':param').replace(/\*/g, '*');
}

async function main() {
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

  console.log('=== Dual-Source Drift Sentinel ===\n');

  const tsRoutes = dedupe(await extractRoutes(TS_SERVER));
  const jsRoutes = dedupe(await extractRoutes(JS_SERVER));

  console.log(`Parsed ${tsRoutes.length} unique routes from server.ts`);
  console.log(`Parsed ${jsRoutes.length} unique routes from server.js\n`);

  const tsSet = new Set(tsRoutes.map((r) => `${r.method}:${normalizePath(r.path)}`));
  const jsSet = new Set(jsRoutes.map((r) => `${r.method}:${normalizePath(r.path)}`));

  const allowlistRaw = await fs.readFile(ALLOWLIST, 'utf-8').catch(() => '{"allowed":[]}');
  const allowlist = JSON.parse(allowlistRaw);
  const allowedSet = new Set((allowlist.allowed || []).map((entry) => {
    const [method, ...rest] = entry.split(':');
    const rawPath = rest.join(':');
    return `${method}:${normalizePath(rawPath)}`;
  }));
  console.log('Allowed routes:', [...allowedSet].sort().join('\n    '));

  const missingFromTs = [];
  const missingFromJs = [];

  for (const r of jsRoutes) {
    const key = `${r.method}:${normalizePath(r.path)}`;
    if (!tsSet.has(key) && !allowedSet.has(key)) {
      missingFromTs.push(r);
    }
  }

  for (const r of tsRoutes) {
    const key = `${r.method}:${normalizePath(r.path)}`;
    if (!jsSet.has(key)) {
      missingFromJs.push(r);
    }
  }

  assert(missingFromTs.length === 0, `No runtime-only routes missing from typechecked source (found ${missingFromTs.length})`);
  if (missingFromTs.length > 0) {
    console.error('  Routes in server.js but NOT in server.ts (and not allowlisted):');
    for (const r of missingFromTs) {
      console.error(`    ${r.method} ${r.path}`);
    }
  }

  if (missingFromJs.length > 0) {
    console.log(`  [WARN] ${missingFromJs.length} typechecked routes not present in runtime (expected for simulation-only endpoints):`);
    for (const r of missingFromJs) {
      console.log(`    ${r.method} ${r.path}`);
    }
  }

  assert(tsRoutes.length > 0, 'server.ts defines routes');
  assert(jsRoutes.length > 0, 'server.js defines routes');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
