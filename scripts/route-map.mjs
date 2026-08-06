#!/usr/bin/env node
/**
 * scripts/route-map.mjs — Engineering OS endpoint inventory
 * ---------------------------------------------------------------------------
 * Maps every API route in the system to a machine-readable inventory:
 *   - method, path, handler source (server.js or router)
 *   - auth class (public / gated-when-provisioned / agent-auth)
 *   - rate-limit class (global / api / ingest / exempt)
 *   - category (system / telemetry / governance / agents / think / misc)
 *
 * Writes benchmarks/route-map.json (the canonical, versioned endpoint map)
 * so the surface is always tracked. Read-only against the server.
 *
 * Usage:
 *   node scripts/route-map.mjs              # scan + write route-map.json
 *   node scripts/route-map.mjs --json       # print inventory
 *   node scripts/route-map.mjs --summary    # counts by category/method
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'benchmarks', 'route-map.json');

// ── Sources ────────────────────────────────────────────────────────────────

function extractRoutes(source, base = '') {
  const routes = [];
  const pattern = /\b(app|router)\.(get|post|put|patch|delete)\('([^']+)'/g;
  let m;
  while ((m = pattern.exec(source)) !== null) {
    const full = base + m[3];
    routes.push({ method: m[2].toUpperCase(), path: full, handler: 'server.js' });
  }
  return routes;
}

function scanServer() {
  const src = readFileSync(join(REPO_ROOT, 'services', 'ingestion', 'server.js'), 'utf8');
  const routes = extractRoutes(src);
  // Tag which came from mounted routers by matching the mount prefixes.
  return routes.map((r) => ({ ...r, handler: r.path.startsWith('/api/system') ? 'system.ts' : r.path.startsWith('/api/governance') ? 'governance.ts' : r.path.startsWith('/api/telemetry') ? 'telemetry.ts' : 'server.js' }));
}

function scanRouters() {
  const routes = [];
  const dir = join(REPO_ROOT, 'services', 'ingestion', 'routes');
  const prefixes = { system: '/api/system', governance: '/api/governance', telemetry: '/api/telemetry', audit: '/api/audit', thinkbox: '/api/thinkbox', tools: '/api/tools' };
  for (const [name, prefix] of Object.entries(prefixes)) {
    const f = join(dir, name + '.ts');
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    const found = extractRoutes(src);
    for (const r of found) {
      // Router paths are RELATIVE to their mount (e.g. '/agent-status' under
      // the /api/system mount → /api/system/agent-status). Only paths that
      // already start with '/api/' are absolute.
      const path = r.path.startsWith('/api/') ? r.path : prefix + r.path;
      routes.push({ method: r.method, path, handler: name + '.ts' });
    }
  }
  return routes;
}

// ── Classification ─────────────────────────────────────────────────────────

function classify(path, method) {
  // Auth class
  let auth = 'public';
  if (path === '/api/terminal/execute') auth = 'gated-when-provisioned';
  else if (path.includes('/api/governance') && method === 'POST') auth = 'agent-auth';
  else if (path.startsWith('/api/system') && method !== 'GET') auth = 'agent-auth';
  else if (path.startsWith('/api/telemetry/ingest')) auth = 'public';
  // SEC-hardened mutation endpoints (requireAgentAuth gate).
  else if (['/api/telemetry/purge', '/api/agents/dispatch', '/api/audit/vault/anchor', '/api/audit/vault/verify', '/api/memory/remember', '/api/router/reset', '/api/think/archive', '/api/vector/sync'].includes(path)) auth = 'agent-auth';
  // Tools router is agent-auth gated (requireAgent on the router).
  else if (path.startsWith('/api/tools/')) auth = 'agent-auth';

  // Rate-limit class
  let rateLimit = 'global';
  if (path === '/health' || path.startsWith('/api/os-stream') || path.startsWith('/api/sse') || path.includes('/assets/') || path === '/') rateLimit = 'exempt';
  else if (path.startsWith('/api/telemetry/ingest')) rateLimit = 'ingest';
  else if (path.startsWith('/api/') && method === 'GET') rateLimit = 'api';

  // Category
  let category = 'misc';
  if (path.startsWith('/api/system') || path === '/health' || path === '/api/health-check') category = 'system';
  else if (path.startsWith('/api/telemetry') || path.startsWith('/api/think')) category = 'telemetry';
  else if (path.startsWith('/api/governance')) category = 'governance';
  else if (path.startsWith('/api/agents')) category = 'agents';
  else if (path.startsWith('/api/memory')) category = 'memory';
  else if (path.startsWith('/api/terminal')) category = 'terminal';

  return { auth, rateLimit, category };
}

// ── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = [...scanServer(), ...scanRouters()];
  // Dedupe (router-mounted paths may also appear as server.js direct routes).
  const seen = new Set();
  const routes = [];
  for (const r of all) {
    const key = r.method + ' ' + r.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const cls = classify(r.path, r.method);
    routes.push({ ...r, ...cls });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));

  const inventory = {
    version: 1,
    generatedAt: new Date().toISOString(),
    total: routes.length,
    summary: {
      byMethod: routes.reduce((acc, r) => { acc[r.method] = (acc[r.method] || 0) + 1; return acc; }, {}),
      byCategory: routes.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {}),
      byAuth: routes.reduce((acc, r) => { acc[r.auth] = (acc[r.auth] || 0) + 1; return acc; }, {}),
      byRateLimit: routes.reduce((acc, r) => { acc[r.rateLimit] = (acc[r.rateLimit] || 0) + 1; return acc; }, {}),
    },
    routes,
  };

  if (args.includes('--json')) {
    console.log(JSON.stringify(inventory, null, 2));
  } else if (args.includes('--summary')) {
    console.log('\n  ENGINEERING OS — ENDPOINT INVENTORY');
    console.log(`  total: ${inventory.total}`);
    console.log('  by method:  ' + Object.entries(inventory.summary.byMethod).map(([k, v]) => `${k}=${v}`).join('  '));
    console.log('  by category:' + Object.entries(inventory.summary.byCategory).map(([k, v]) => ` ${k}=${v}`).join(' '));
    console.log('  by auth:    ' + Object.entries(inventory.summary.byAuth).map(([k, v]) => ` ${k}=${v}`).join(' '));
    console.log('  by rate:    ' + Object.entries(inventory.summary.byRateLimit).map(([k, v]) => ` ${k}=${v}`).join(' '));
    console.log('');
  } else {
    writeFileSync(OUT_PATH, JSON.stringify(inventory, null, 2), 'utf8');
    console.log(`[ROUTE-MAP] ${inventory.total} endpoints mapped → benchmarks/route-map.json`);
    console.log(`  GET=${inventory.summary.byMethod.GET || 0}  POST=${inventory.summary.byMethod.POST || 0}  PATCH=${inventory.summary.byMethod.PATCH || 0}  PUT=${inventory.summary.byMethod.PUT || 0}  DELETE=${inventory.summary.byMethod.DELETE || 0}`);
  }
}
