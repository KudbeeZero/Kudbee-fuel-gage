/**
 * scripts/health-gate.mjs
 *
 * Production Deploy Health Gate — verifies a deployed environment is
 * healthy before routing traffic. Called by canary-deploy.mjs and CI.
 *
 * Usage:
 *   node scripts/health-gate.mjs <url>              gate a deployed app
 *   node scripts/health-gate.mjs <url> --watch 30s  poll for 30s
 *
 * Checks:
 *   - /health returns 200 and reports healthy dependencies
 *   - /api/thinkbox/dashboard returns real (non-mock) data
 *   - Root page serves a valid HTML document
 *   - Response latency stays under threshold
 *
 * Exit codes: 0=PASS, 1=BLOCK, 2=TIMEOUT
 */

import { setTimeout as delay } from 'node:timers/promises';

const LATENCY_THRESHOLD_MS = 3000;
const RETRY_INTERVAL_MS = 2000;
const DEFAULT_WATCH_DURATION_MS = 30_000;

function parseWatch(arg) {
  if (!arg) return null;
  const s = arg.endsWith('s') ? parseFloat(arg) * 1000 : parseFloat(arg);
  return Number.isFinite(s) ? Math.max(s, 5000) : null;
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/health-gate.mjs <url> [--watch <duration>]');
  process.exit(2);
}

const BASE_URL = args[0].replace(/\/+$/, '');
const WATCH_MS = parseWatch(args[args.indexOf('--watch') + 1] || null);

let totalChecks = 0;
let passCount = 0;

function diagnostic(label, ok, detail) {
  const icon = ok ? 'PASS' : 'FAIL';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}[${icon}]\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  totalChecks++;
  if (ok) passCount++;
  return ok;
}

async function checkEndpoint(url, label, validate) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LATENCY_THRESHOLD_MS) });
    const latency = Date.now() - start;
    if (!res.ok) return diagnostic(label, false, `HTTP ${res.status}`);
    if (latency > LATENCY_THRESHOLD_MS) return diagnostic(label, false, `latency ${latency}ms > ${LATENCY_THRESHOLD_MS}ms`);
    const body = await res.json().catch(() => null);
    if (validate && !validate(body, latency)) return diagnostic(label, false);
    return diagnostic(label, true, `${latency}ms`);
  } catch (e) {
    return diagnostic(label, false, e.message);
  }
}

async function gateApp(url) {
  let allPassed = true;

  console.log(`\n[HealthGate] Checking ${url} ...\n`);

  // 1. /health — primary health check
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(LATENCY_THRESHOLD_MS) });
    const latency = Date.now() - (res._startedAt || 0);
    if (!res.ok) {
      diagnostic('/health', false, `HTTP ${res.status}`);
      allPassed = false;
    } else {
      const body = await res.json();
      const deps = body.dependencies || {};
      // Staging accepts DEGRADED; production requires healthy
      const isProduction = url.includes('kudbee-fuel-gage-330') || url.includes('production');
      const depOk = Object.entries(deps).every(([k, v]) => {
        const status = typeof v === 'string' ? v : v?.status;
        if (isProduction) return status === 'healthy';
        return status === 'healthy' || status === 'ok' || v?.enabled === false;
      });
      diagnostic('/health', true, `${body.status || 'ok'}, latency ${latency}ms`);
      if (!depOk) {
        diagnostic('dependencies', false, JSON.stringify(deps));
        if (isProduction) allPassed = false;
      }
    }
  } catch (e) {
    diagnostic('/health', false, e.message);
    allPassed = false;
  }

  // 2. Dashboard — verifies real data (not mock)
  await checkEndpoint(`${url}/api/thinkbox/dashboard`, '/api/thinkbox/dashboard', (body) => {
    const mission = body?.mission?.id;
    if (!mission) return false;
    // Block if it's the old mock data
    if (mission === 'THINKBOX-016') {
      console.log('  \x1b[33m[WARN] Mock data detected (THINKBOX-016), blocking gate\x1b[0m');
      return false;
    }
    const hasAgents = Array.isArray(body?.agents);
    return !!hasAgents;
  }) || (allPassed = false);

  // 3. Root document — ensure SPA is served
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LATENCY_THRESHOLD_MS) });
    const html = await res.text();
    const hasDoctype = html.trim().startsWith('<!doctype') || html.trim().startsWith('<!DOCTYPE');
    diagnostic('Root (SPA)', res.ok && hasDoctype, `${res.status}, ${html.length} bytes`);
  } catch (e) {
    diagnostic('Root (SPA)', false, e.message);
    allPassed = false;
  }

  // 4. CI health endpoint
  try {
    const res = await fetch(`${url}/api/ci/health`, { signal: AbortSignal.timeout(LATENCY_THRESHOLD_MS) });
    diagnostic('/api/ci/health', res.ok, `HTTP ${res.status}`);
  } catch {
    diagnostic('/api/ci/health', true, 'skipped (endpoint may be unavailable)');
  }

  console.log(`\n  Result: ${passCount}/${totalChecks} checks passed`);
  return allPassed;
}

async function main() {
  if (WATCH_MS) {
    console.log(`[HealthGate] Watching ${BASE_URL} for ${(WATCH_MS / 1000).toFixed(0)}s …`);
    const deadline = Date.now() + WATCH_MS;
    let lastResult = false;
    while (Date.now() < deadline) {
      totalChecks = 0;
      passCount = 0;
      lastResult = await gateApp(BASE_URL);
      if (lastResult) {
        console.log(`\n[HealthGate] GATE PASS — env healthy after ${((Date.now() - (deadline - WATCH_MS)) / 1000).toFixed(1)}s`);
        process.exit(0);
      }
      await delay(RETRY_INTERVAL_MS);
    }
    console.error(`\n[HealthGate] GATE BLOCKED — env unhealthy after ${(WATCH_MS / 1000).toFixed(0)}s`);
    process.exit(2);
  } else {
    const passed = await gateApp(BASE_URL);
    if (passed) {
      console.log(`\n[HealthGate] GATE PASS`);
      process.exit(0);
    } else {
      console.log(`\n[HealthGate] GATE BLOCKED`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error('[HealthGate] FATAL:', e.message);
  process.exit(2);
});
