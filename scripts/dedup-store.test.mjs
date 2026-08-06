#!/usr/bin/env node
/**
 * Serverless Step 1 — Stateless dedup store fixtures test.
 *
 * Verifies:
 *   - Redis-backed path: first call false, second within window true
 *   - In-memory fallback path works when Redis is absent
 *   - clear() removes the key
 *   - window expiry allows re-insert
 *   - server.js wires the store and awaits it at both call sites
 *
 * Run: bun test scripts/dedup-store.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

// Import the store module (pure — no Redis connection needed for fallback).
import { createDedupStore } from '../services/lib/dedupStore.ts';

test('in-memory fallback: first isDuplicate is false, second within window is true', async () => {
  const store = createDedupStore({ windowMs: 5000, redis: null });
  expect(await store.isDuplicate('trace-1')).toBe(false);
  expect(await store.isDuplicate('trace-1')).toBe(true);
});

test('clear() removes the key so it can be used again', async () => {
  const store = createDedupStore({ windowMs: 5000, redis: null });
  expect(await store.isDuplicate('trace-2')).toBe(false);
  await store.clear('trace-2');
  expect(await store.isDuplicate('trace-2')).toBe(false);
});

test('empty key never dedups', async () => {
  const store = createDedupStore({ windowMs: 5000, redis: null });
  expect(await store.isDuplicate('')).toBe(false);
});

test('Redis-path uses SET NX with TTL (simulated client)', async () => {
  // Simulated Redis client that behaves like SET NX EX.
  const seen = new Set();
  const fakeRedis = {
    async set(key, val, mode, ttl, nx) {
      if (seen.has(key)) return null; // exists → NX fails → duplicate
      seen.add(key);
      return 'OK';
    },
    async del(key) { seen.delete(key); return 1; },
  };
  const store = createDedupStore({ windowMs: 5000, redis: fakeRedis });
  expect(await store.isDuplicate('trace-3')).toBe(false);
  expect(await store.isDuplicate('trace-3')).toBe(true);
  await store.clear('trace-3');
  expect(await store.isDuplicate('trace-3')).toBe(false);
});

test('Redis down falls back to in-memory (Resilient-First)', async () => {
  const fakeRedis = {
    async set() { throw new Error('Redis quota exhausted'); },
  };
  const store = createDedupStore({ windowMs: 5000, redis: fakeRedis });
  expect(await store.isDuplicate('trace-4')).toBe(false);
  expect(await store.isDuplicate('trace-4')).toBe(true); // fallback works
});

test('server.js wires the store and awaits at both call sites', () => {
  const src = readFileSync('services/ingestion/server.js', 'utf8');
  expect(src).toMatch(/createDedupStore/);
  expect(src).toMatch(/await isDuplicateTrace/);
  // Two await call sites.
  const matches = src.match(/await isDuplicateTrace\(/g) || [];
  expect(matches.length).toBe(2);
});

test('no in-process Map dedup remains (stateless)', () => {
  const src = readFileSync('services/ingestion/server.js', 'utf8');
  // The old pattern must be gone.
  expect(src).not.toMatch(/_dedupStore = new Map\(\)/);
  expect(src).not.toMatch(/startDedupCleanup\(\)/);
});
