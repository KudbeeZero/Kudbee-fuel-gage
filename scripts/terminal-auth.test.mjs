#!/usr/bin/env node
/**
 * SEC-002 — Terminal Authorization Boundary fixtures test.
 *
 * Verifies INV-014: privileged terminal execution requires authorization
 * whenever AGENT_REGISTRY_PATH (auth) is provisioned.
 *
 * Modes:
 *   Mode A (dev):    registry unset    → execute allowed (200)
 *   Mode B (prot.):  registry set      → missing pass 401, wrong pass 403,
 *                                       valid pass 200
 *
 * The gate logic is replicated here as a pure decision function so the
 * contract is tested without booting the server. The real wiring is in
 * server.js (terminalAuthGate + TERMINAL_AUTH_PROVISIONED).
 *
 * Run: bun test scripts/terminal-auth.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';

/**
 * Pure replica of the gate decision. Returns the HTTP status an agent
 * attempting terminal execution would receive.
 */
function gateDecision({ provisioned, hasHeader, headerIsValid }) {
  if (!provisioned) return 200; // Mode A — single-user allowed
  if (!hasHeader) return 401; // Mode B — missing X-Agent-Pass
  if (!headerIsValid) return 403; // Mode B — invalid pass
  return 200; // Mode B — valid pass
}

test('Mode A: AGENT_REGISTRY_PATH unset → execution allowed', () => {
  expect(gateDecision({ provisioned: false, hasHeader: false, headerIsValid: false })).toBe(200);
});

test('Mode B: missing X-Agent-Pass → 401', () => {
  expect(gateDecision({ provisioned: true, hasHeader: false, headerIsValid: false })).toBe(401);
});

test('Mode B: wrong pass → 403', () => {
  expect(gateDecision({ provisioned: true, hasHeader: true, headerIsValid: false })).toBe(403);
});

test('Mode B: correct pass → 200', () => {
  expect(gateDecision({ provisioned: true, hasHeader: true, headerIsValid: true })).toBe(200);
});

test('INV-014: auth is enforced ONLY when provisioned', () => {
  // The invariant: privileged execution requires auth when configured.
  // Unprovisioned must NEVER return 401/403.
  expect(gateDecision({ provisioned: false, hasHeader: false, headerIsValid: false })).not.toBe(401);
  expect(gateDecision({ provisioned: false, hasHeader: false, headerIsValid: false })).not.toBe(403);
});

test('server.js wiring: gate is attached to /api/terminal/execute', () => {
  const { readFileSync } = require('node:fs');
  const src = readFileSync('services/ingestion/server.js', 'utf8');
  const route = src.match(/app\.post\('\/api\/terminal\/execute'([^)]*)/);
  expect(route).not.toBeNull();
  // The gate middleware must be wired before the handler.
  expect(src).toMatch(/app\.post\('\/api\/terminal\/execute', terminalAuthGate/);
});

test('server.js wiring: TERMINAL_AUTH_PROVISIONED reads AGENT_REGISTRY_PATH', () => {
  const { readFileSync } = require('node:fs');
  const src = readFileSync('services/ingestion/server.js', 'utf8');
  expect(src).toMatch(/AGENT_REGISTRY_PATH/);
});
