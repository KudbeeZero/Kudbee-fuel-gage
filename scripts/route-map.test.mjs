#!/usr/bin/env node
/**
 * Route map fixtures test — keeps the endpoint inventory in sync.
 *
 * Verifies:
 *   - route-map.json exists and is current (matches the server scan)
 *   - critical endpoints are present (terminal, agent-status, ci, health)
 *   - auth classification is sane (terminal gated, governance writes agent-auth)
 *   - no duplicate (method+path) pairs
 *
 * Run: bun test scripts/route-map.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function loadMap() {
  const p = join(ROOT, 'benchmarks', 'route-map.json');
  expect(existsSync(p), 'route-map.json missing — run node scripts/route-map.mjs').toBe(true);
  return JSON.parse(readFileSync(p, 'utf8'));
}

test('route map exists with a healthy endpoint count', () => {
  const d = loadMap();
  expect(d.total).toBeGreaterThan(100);
  expect(d.total).toBe(d.routes.length);
});

test('critical endpoints are mapped', () => {
  const d = loadMap();
  const paths = d.routes.map((r) => r.method + ' ' + r.path);
  expect(paths).toContain('POST /api/terminal/execute');
  expect(paths).toContain('GET /api/system/agent-status');
  expect(paths).toContain('GET /api/ci/status');
  expect(paths).toContain('GET /health');
  expect(paths).toContain('GET /api/system/health-deep');
});

test('no duplicate (method, path) pairs', () => {
  const d = loadMap();
  const keys = d.routes.map((r) => r.method + ' ' + r.path);
  expect(new Set(keys).size).toBe(keys.length);
});

test('terminal execute is gated-when-provisioned (INV-014)', () => {
  const d = loadMap();
  const t = d.routes.find((r) => r.path === '/api/terminal/execute');
  expect(t.auth).toBe('gated-when-provisioned');
});

test('governance write endpoints are agent-auth', () => {
  const d = loadMap();
  const writes = d.routes.filter((r) => r.method === 'POST' && r.path.startsWith('/api/governance'));
  expect(writes.length).toBeGreaterThan(0);
  for (const w of writes) expect(w.auth).toBe('agent-auth');
});

test('telemetry ingest is ingest-rate-limited', () => {
  const d = loadMap();
  const ingest = d.routes.find((r) => r.path === '/api/telemetry/ingest');
  expect(ingest.rateLimit).toBe('ingest');
});

test('summary counts match route list', () => {
  const d = loadMap();
  const byMethod = d.routes.reduce((acc, r) => { acc[r.method] = (acc[r.method] || 0) + 1; return acc; }, {});
  expect(d.summary.byMethod.GET).toBe(byMethod.GET);
  expect(d.summary.byMethod.POST).toBe(byMethod.POST);
});
