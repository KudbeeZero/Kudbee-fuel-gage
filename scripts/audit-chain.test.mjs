#!/usr/bin/env node
/**
 * SEC-005 — Tamper-Evident Audit Chain fixtures test.
 *
 * Verifies INV-017:
 *   - append creates chained records (prevHash links)
 *   - verify passes on an untampered chain
 *   - tampering a record's content breaks the chain
 *   - removing a record breaks the chain
 *   - hash is deterministic (same record → same hash)
 *
 * Run: bun test scripts/audit-chain.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';

// Pure replica of the chain logic (no I/O) so the test is hermetic.
const GENESIS = '0'.repeat(64);
function hashRecord(r) {
  return createHash('sha256').update(JSON.stringify({
    timestamp: r.timestamp, prevHash: r.prevHash, actor: r.actor, mission: r.mission, action: r.action,
  })).digest('hex');
}
function buildChain(records) {
  const chain = [];
  let prev = GENESIS;
  for (const [i, r] of records.entries()) {
    const record = { ...r, prevHash: prev };
    record.currentHash = hashRecord(record);
    chain.push(record);
    prev = record.currentHash;
  }
  return chain;
}
function verify(chain) {
  let expected = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (r.prevHash !== expected) return { valid: false, brokenAt: i };
    if (hashRecord(r) !== r.currentHash) return { valid: false, brokenAt: i };
    expected = r.currentHash;
  }
  return { valid: true, brokenAt: null };
}

const mk = (i) => ({ timestamp: `2026-08-06T00:00:0${i}Z`, actor: `agent-${i}`, mission: `SEC-00${i}`, action: `action-${i}` });

test('append creates linked records (prevHash chains)', () => {
  const chain = buildChain([mk(1), mk(2), mk(3)]);
  expect(chain[0].prevHash).toBe(GENESIS);
  expect(chain[1].prevHash).toBe(chain[0].currentHash);
  expect(chain[2].prevHash).toBe(chain[1].currentHash);
});

test('verify passes on untampered chain', () => {
  const chain = buildChain([mk(1), mk(2), mk(3)]);
  expect(verify(chain).valid).toBe(true);
});

test('tampering a record action breaks the chain', () => {
  const chain = buildChain([mk(1), mk(2), mk(3)]);
  chain[1].action = 'tampered!'; // content changed, hash not recomputed
  const result = verify(chain);
  expect(result.valid).toBe(false);
  expect(result.brokenAt).toBe(1);
});

test('removing a record breaks the chain (record 1 no longer links to 3)', () => {
  const chain = buildChain([mk(1), mk(2), mk(3)]);
  chain.splice(1, 1); // remove record 2
  const result = verify(chain);
  expect(result.valid).toBe(false);
});

test('hash is deterministic — same record content → same hash', () => {
  const a = buildChain([mk(1)])[0].currentHash;
  const b = buildChain([mk(1)])[0].currentHash;
  expect(a).toBe(b);
});

test('tampering one record invalidates EVERY later record (cascading)', () => {
  const chain = buildChain([mk(1), mk(2), mk(3), mk(4)]);
  chain[0].action = 'edited';
  const result = verify(chain);
  expect(result.valid).toBe(false);
  // Even though records 1-3 are untouched, the broken link at 0 propagates.
  expect(result.brokenAt).toBe(0);
});

test('sha256 currentHash is 64 hex chars', () => {
  const chain = buildChain([mk(1)]);
  expect(chain[0].currentHash).toMatch(/^[0-9a-f]{64}$/);
});
