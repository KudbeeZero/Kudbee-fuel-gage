#!/usr/bin/env node
/**
 * scripts/verify-think-lifecycle-primitive.mjs — Phase 5M low-level lifecycle
 * authority invariant.
 *
 * Proves the mint primitive can NEVER create a privileged state:
 *   - mintThinkToken() → PENDING_APPROVAL
 *   - mintThinkToken(status=VERIFIED) → PENDING_APPROVAL (forced)
 *   - mintThinkToken(status=RECYCLED) → PENDING_APPROVAL (forced)
 *   - mintThinkToken(status=PROVEN) → PENDING_APPROVAL (forced)
 *
 * And that the separate transition primitive is the ONLY path to privileged
 * states:
 *   - transitionThinkTokenStatus(VERIFIED) → ok
 *   - transitionThinkTokenStatus(RECYCLED) → ok
 *   - transitionThinkTokenStatus(invalid) → rejected
 *   - transitionThinkTokenStatus(no tokenId) → rejected
 *
 * Runs against the in-memory fallback (no DATABASE_URL) so it is hermetic.
 * Run: node --experimental-strip-types scripts/verify-think-lifecycle-primitive.mjs
 */
process.env.DATABASE_URL = '';
delete process.env.GEMINI_API_KEY;
delete process.env.REDIS_URL;

import { mintThinkToken, transitionThinkTokenStatus } from '../services/memory/thinkTokenGenerator.ts';
import { _memoryStore } from '../services/lib/db.js';

let passed = 0;
let failed = 0;
function assert(check, label) {
  if (check) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.error(`  [FAIL] ${label}`); failed++; }
}
function statusOf(id) {
  const row = _memoryStore.think_tokens.find((r) => String(r.id) === String(id));
  return row ? row.status : null;
}

async function mint(status) {
  const payload = {
    traceId: `prim-${Date.now()}-${Math.random()}`,
    correctionDelta: 'primitive lifecycle test',
    kd: 0.9,
    efficacy: 0.9,
  };
  if (status) payload.status = status;
  return mintThinkToken(payload);
}

async function main() {
  console.log('═══ PHASE 5M — LOW-LEVEL THINK-TOKEN LIFECYCLE INVARIANT ═══');

  // ── MINT INVARIANT ──
  const r1 = await mint();
  assert(r1.ok === true, 'mintThinkToken() succeeds');
  assert(statusOf(r1.id) === 'PENDING_APPROVAL', 'mintThinkToken() → PENDING_APPROVAL');

  const r2 = await mint('VERIFIED');
  assert(r2.ok === true, 'mintThinkToken(status=VERIFIED) succeeds (forced)');
  assert(statusOf(r2.id) === 'PENDING_APPROVAL', 'mintThinkToken(status=VERIFIED) → PENDING_APPROVAL (never VERIFIED)');

  const r3 = await mint('RECYCLED');
  assert(r3.ok === true, 'mintThinkToken(status=RECYCLED) succeeds (forced)');
  assert(statusOf(r3.id) === 'PENDING_APPROVAL', 'mintThinkToken(status=RECYCLED) → PENDING_APPROVAL (never RECYCLED)');

  const r4 = await mint('PROVEN');
  assert(r4.ok === true, 'mintThinkToken(status=PROVEN) succeeds (forced)');
  assert(statusOf(r4.id) === 'PENDING_APPROVAL', 'mintThinkToken(status=PROVEN) → PENDING_APPROVAL (never PROVEN)');

  // ── TRANSITION PRIMITIVE ──
  const t1 = await transitionThinkTokenStatus({ tokenId: r1.id, status: 'VERIFIED' });
  assert(t1.ok === true && statusOf(r1.id) === 'VERIFIED', 'transition(VERIFIED) → VERIFIED');

  const t2 = await transitionThinkTokenStatus({ tokenId: r2.id, status: 'RECYCLED' });
  assert(t2.ok === true && statusOf(r2.id) === 'RECYCLED', 'transition(RECYCLED) → RECYCLED');

  const t3 = await transitionThinkTokenStatus({ tokenId: r3.id, status: 'PROVEN' });
  assert(t3.ok === false, 'transition(PROVEN) rejected (only VERIFIED/RECYCLED)');

  const t4 = await transitionThinkTokenStatus({ tokenId: r4.id, status: 'PENDING_APPROVAL' });
  assert(t4.ok === false, 'transition(PENDING_APPROVAL) rejected');

  const t5 = await transitionThinkTokenStatus({ tokenId: '', status: 'VERIFIED' });
  assert(t5.ok === false, 'transition(no tokenId) rejected');

  // ── ATTACK: internal caller cannot mint VERIFIED ──
  const attack = await mint('VERIFIED');
  assert(statusOf(attack.id) === 'PENDING_APPROVAL', 'internal caller mint(status=VERIFIED) cannot create VERIFIED');

  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
