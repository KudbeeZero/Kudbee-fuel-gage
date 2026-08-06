#!/usr/bin/env node
/**
 * Infra — Dyno memory budget fixtures test.
 *
 * Verifies the Procfile right-sizes every process to its dyno tier:
 *   - Basic dyno = 512MB RAM
 *   - V8 heap cap (--max-old-space-size) must be ≤ 65% of dyno RAM so
 *     native code / GC / worker threads have headroom (no OOM under load)
 *   - release dyno is not resident (boot-verify only)
 *
 * Run: bun test scripts/dyno-sizing.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const PROC = readFileSync('Procfile', 'utf8');
const TIERS = { Basic: 512, Eco: 512, Standard_1X: 512, Performance_M: 1024 };

// Parse a --max-old-space-size=N flag from a Procfile command line.
function heapOf(line) {
  const m = line.match(/--max-old-space-size=(\d+)/);
  return m ? Number(m[1]) : null;
}

test('web heap cap is within 65% of Basic dyno RAM (no OOM under load)', () => {
  const web = PROC.split('\n').find((l) => l.startsWith('web:'));
  const heap = heapOf(web);
  expect(heap).not.toBeNull();
  expect(heap).toBeLessThanOrEqual(Math.floor(TIERS.Basic * 0.65)); // ≤ 332MB
  expect(heap).toBeGreaterThan(200); // still enough for the server
});

test('all worker heap caps are ≤ 65% of Basic dyno RAM', () => {
  for (const name of ['hermes-worker', 'monitor-worker', 'sentinel']) {
    const line = PROC.split('\n').find((l) => l.startsWith(`${name}:`));
    expect(line, `missing ${name} in Procfile`).toBeTruthy();
    const heap = heapOf(line);
    expect(heap, `${name} must set --max-old-space-size`).not.toBeNull();
    expect(heap).toBeLessThanOrEqual(Math.floor(TIERS.Basic * 0.65));
  }
});

test('release dyno is boot-verify only (not resident, bounded heap)', () => {
  const release = PROC.split('\n').find((l) => l.startsWith('release:'));
  expect(release).toContain('boot-verify.mjs');
  const heap = heapOf(release);
  expect(heap).not.toBeNull();
  expect(heap).toBeLessThanOrEqual(256);
});

test('every process line sets a bounded heap (no unbounded defaults)', () => {
  const lines = PROC.split('\n').filter((l) => /^[a-z-]+:/.test(l));
  for (const l of lines) {
    expect(heapOf(l), `unbounded heap in: ${l}`).not.toBeNull();
  }
});

test('web uses --max-semi-space-size to reduce GC pressure', () => {
  const web = PROC.split('\n').find((l) => l.startsWith('web:'));
  expect(web).toMatch(/--max-semi-space-size=\d+/);
});
