#!/usr/bin/env node
/**
 * scripts/audit-chain.mjs — SEC-005 Tamper-Evident Audit Chain (INV-017)
 * ---------------------------------------------------------------------------
 * Append-only, cryptographically chained audit log. Every record stores:
 *   timestamp · previous hash · current hash · actor · mission · action
 *
 * Changing one record invalidates every later record — the chain is
 * tamper-evident. Verification recomputes every hash and fails on any
 * mismatch (tamper detected).
 *
 * INV-017: Audit records are hash-chained; altering history is detectable.
 *
 * Usage:
 *   node scripts/audit-chain.mjs append <actor> <mission> <action>
 *   node scripts/audit-chain.mjs verify            # chain integrity
 *   node scripts/audit-chain.mjs tail [n]          # last n records
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CHAIN_PATH = join(REPO_ROOT, '.kilo', 'audit-chain.json');

mkdirSync(dirname(CHAIN_PATH), { recursive: true });

const GENESIS_HASH = '0'.repeat(64);

function hashRecord(record) {
  const canonical = JSON.stringify({
    timestamp: record.timestamp,
    prevHash: record.prevHash,
    actor: record.actor,
    mission: record.mission,
    action: record.action,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function loadChain() {
  try {
    if (existsSync(CHAIN_PATH)) return JSON.parse(readFileSync(CHAIN_PATH, 'utf8'));
  } catch {}
  return { version: 1, createdAt: new Date().toISOString(), records: [] };
}

function saveChain(chain) {
  writeFileSync(CHAIN_PATH, JSON.stringify(chain, null, 2), 'utf8');
}

/**
 * Append a record. Deterministic: hash depends only on the record's own
 * content + the previous hash, so verification can recompute the whole chain.
 */
export function appendAudit(actor, mission, action) {
  const chain = loadChain();
  const prev = chain.records[chain.records.length - 1] || null;
  const record = {
    timestamp: new Date().toISOString(),
    prevHash: prev ? prev.currentHash : GENESIS_HASH,
    actor,
    mission: mission || 'UNASSIGNED',
    action,
  };
  record.currentHash = hashRecord(record);
  chain.records.push(record);
  saveChain(chain);
  return record;
}

/**
 * Verify chain integrity. Recomputes every hash; returns { valid, brokenAt }.
 * Any tampering (record edited, record removed, order changed) breaks the
 * chain at the first mismatch.
 */
export function verifyChain() {
  const chain = loadChain();
  let expected = GENESIS_HASH;
  for (let i = 0; i < chain.records.length; i++) {
    const r = chain.records[i];
    if (r.prevHash !== expected) {
      return { valid: false, brokenAt: i, expectedPrev: expected, actualPrev: r.prevHash };
    }
    const recomputed = hashRecord(r);
    if (recomputed !== r.currentHash) {
      return { valid: false, brokenAt: i, expectedHash: recomputed, actualHash: r.currentHash };
    }
    expected = r.currentHash;
  }
  return { valid: true, brokenAt: null, records: chain.records.length };
}

// ─── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'append': {
      const [actor, mission, ...actionParts] = args.slice(1);
      const action = actionParts.join(' ') || '';
      if (!actor || !action) {
        console.error('Usage: append <actor> <mission> <action>');
        process.exit(1);
      }
      const record = appendAudit(actor, mission, action);
      console.log(`[AUDIT] ${record.currentHash.slice(0, 12)}  ${record.actor}  ${record.mission}  ${record.action}`);
      break;
    }

    case 'verify': {
      const result = verifyChain();
      console.log('\n  ┌────────────────────────────────────────────────┐');
      console.log('  │  SEC-005 — TAMPER-EVIDENT AUDIT CHAIN          │');
      console.log('  └────────────────────────────────────────────────┘');
      console.log(`  Records        ${result.records ?? '—'}`);
      console.log(`  Integrity      ${result.valid ? 'INTACT ✓' : 'TAMPERED ✗ at record ' + result.brokenAt}`);
      console.log('  └────────────────────────────────────────────────┘\n');
      process.exit(result.valid ? 0 : 1);
    }

    case 'tail': {
      const chain = loadChain();
      const n = Number(args[1] || 5);
      console.log('\n  Audit chain (last ' + n + '):');
      for (const r of chain.records.slice(-n)) {
        console.log(`  ${r.timestamp.slice(0, 19)}  ${r.actor.padEnd(12)} ${r.mission.padEnd(10)} ${r.action.slice(0, 40)}  [${r.currentHash.slice(0, 8)}]`);
      }
      console.log(`  total: ${chain.records.length}\n`);
      break;
    }

    default:
      console.log(`
  SEC-005 Tamper-Evident Audit Chain

  Commands:
    append <actor> <mission> <action>
    verify
    tail [n]
`);
      process.exit(1);
  }
}
