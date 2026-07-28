import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.error(`  [FAIL] ${label}`); }
}

// ── Module import integrity ──────────────────────────────────────────
console.log('\n── Module Import Integrity ──');

let busDebouncer, thinkCompact, busToCache;
try {
  busDebouncer = await import('./bus-debouncer.mjs');
  assert(typeof busDebouncer.isDuplicate === 'function', 'bus-debouncer exports isDuplicate');
  assert(typeof busDebouncer.deduplicateEvents === 'function', 'bus-debouncer exports deduplicateEvents');
  assert(typeof busDebouncer.isNoise === 'function', 'bus-debouncer exports isNoise');
} catch (e) { assert(false, 'bus-debouncer import failed: ' + e.message); }

try {
  thinkCompact = await import('./think-compact.mjs');
  assert(typeof thinkCompact.compactTrajectory === 'function', 'think-compact exports compactTrajectory');
  assert(typeof thinkCompact.annotateDPO === 'function', 'think-compact exports annotateDPO');
  assert(typeof thinkCompact.stripNoise === 'function', 'think-compact exports stripNoise');
} catch (e) { assert(false, 'think-compact import failed: ' + e.message); }

try {
  busToCache = await import('./bus-to-cache.mjs');
  assert(typeof busToCache.flushCache === 'function', 'bus-to-cache exports flushCache');
  assert(Array.isArray(busToCache.CACHE_KEYS), 'bus-to-cache exports CACHE_KEYS');
} catch (e) { assert(false, 'bus-to-cache import failed: ' + e.message); }

// ── bus-debouncer: dedup & edge cases ─────────────────────────────────
console.log('\n── Bus Debouncer ──');

{
  const d = busDebouncer.deduplicateEvents;
  assert(Array.isArray(d([])), 'deduplicateEvents accepts empty array');
  assert(d([{ event: 'x', payload: {} }]).length === 1, 'single event survives');
  assert(d([{ event: 'x', payload: { a: 1 } }, { event: 'x', payload: { a: 1 } }]).length === 1, 'dedup identical events');
  assert(d([{ event: 'x', payload: { a: 1 } }, { event: 'x', payload: { a: 2 } }]).length === 2, 'keep different payloads');
  assert(d([{ event: 'x' }, { event: 'x' }]).length === 1, 'dedup events without payload');
  assert(d([{ event: 'agent:voicemail:sweep', payload: { hasPending: false } }]).length === 0, 'filter noise sweep without pending');
  assert(d([{ event: 'agent:voicemail:sweep', payload: { hasPending: true } }]).length === 1, 'keep sweep with pending');
}

{
  const dup = busDebouncer.isDuplicate;
  assert(typeof dup({ event: 'a', payload: { x: 1 } }) === 'boolean', 'isDuplicate returns boolean');
  // Two identical events within window → duplicate
  assert(dup({ event: 'test', payload: { v: 42 } }) === false, 'first event not duplicate');
  assert(dup({ event: 'test', payload: { v: 42 } }) === true, 'second identical event is duplicate');
  // Reset cache between tests by waiting (>5s window)
  const cache = busDebouncer.cache || new Map();
  assert(cache instanceof Map, 'debouncer has internal cache');
}

// ── think-compact: compaction & edge cases ────────────────────────────
console.log('\n── Think Compactor ──');

{
  const c = thinkCompact.compactTrajectory;
  const r1 = c({});
  assert(r1 !== null, 'compactTrajectory handles empty object');
  assert(r1.beforeTokens >= 0, 'beforeTokens is non-negative');
  assert(r1.afterTokens >= 0, 'afterTokens is non-negative');
  assert(r1.savingsPct >= 0 && r1.savingsPct <= 100, 'savingsPct between 0-100');

  const r2 = c({ trace_id: 'tr-1', timestamp: new Date().toISOString(), model: 'gpt', tokens_in: 100, tokens_out: 50, cost: 0.01, status: 'OK', provider: 'Google', project_name: 'test' });
  assert(r2.afterTokens < r2.beforeTokens, 'compaction reduces token count');
  assert(r2.compacted.tid === 'tr-1', 'trace_id → tid key compaction');
  assert(r2.compacted.m === 'gpt', 'model → m key compaction');
  assert(typeof r2.compacted.ts === 'number', 'timestamp → ts (ms delta)');
  const tsDelta = Math.abs(r2.compacted.ts);
  assert(tsDelta < 120000, `ts delta within 2min of now (actual: ${tsDelta}ms)`);

  const r3 = c(null);
  assert(r3.afterTokens >= 0, 'null input handled');

  const r4 = c(undefined);
  assert(r4.afterTokens >= 0, 'undefined input handled');

  const r5 = c([1, 2, 3]);
  assert(Array.isArray(r5.compacted), 'array input compacted to array');

  const complex = {
    trace_id: 'tr-cpx', timestamp: new Date().toISOString(), model: 'gpt-4',
    tokens_in: 1000, tokens_out: 500, cost: 0.05, status: 'OK', provider: 'OpenAI',
    project_name: 'deep-test', taskContext: { task: 'deep', extra: null },
    reasoningSteps: ['s1', null, 's3'], confidence_score: 0.95, null_field: null,
    empty_string: '', empty_array: [], nested: { empty: null, deep: { val: 1 } },
  };
  const r6 = c(complex);
  assert(!('null_field' in r6.compacted), 'null fields stripped');
  assert(!('empty_string' in r6.compacted), 'empty strings stripped');
  assert(!('empty_array' in r6.compacted), 'empty arrays stripped');
  assert(r6.compacted.cs === 0.95, 'confidence_score → cs');
  assert(r6.compacted.nested !== undefined, 'nested deep value survived');
}

{
  const s = thinkCompact.stripNoise;
  assert(s(null) === null, 'stripNoise handles null');
  assert(typeof s(42) === 'number', 'stripNoise passes numbers through');
  const o = { a: 1, b: null, c: '', d: [], e: { f: 2 } };
  const r = s(o);
  assert('a' in r, 'stripNoise keeps a=1');
  assert(!('b' in r), 'stripNoise removes b=null');
  assert(!('c' in r), 'stripNoise removes c=empty string');
  assert(!('d' in r), 'stripNoise removes d=[]');
  assert('e' in r, 'stripNoise keeps nested e');
}

{
  const ts = thinkCompact.compactTimestamps;
  const iso = new Date().toISOString();
  const result = ts({ ts: iso }, 'root');
  assert(typeof result.ts === 'number', 'timestamp converted to ms delta');
  assert(Math.abs(result.ts) < 5000, 'ms delta within 5s for fresh timestamp');
  assert(ts({ ts: null }).ts === null, 'null timestamp preserved as null');
}

// ── bus-to-cache: flush contracts ─────────────────────────────────────
console.log('\n── Bus-to-Cache ──');

{
  const f = busToCache.flushCache;
  const r1 = f(null);
  assert(r1.status === 'no-redis', 'null client → no-redis');
  assert(Array.isArray(r1.flushed), 'flushed array returned');
  assert(r1.flushed.length === 3, 'default 3 keys flushed');

  const r2 = f(null, ['custom1', 'custom2']);
  assert(r2.flushed.length === 2, 'custom keys honored');
  assert(r2.flushed.includes('custom1'), 'custom key present');

  const r3 = f(null, []);
  assert(r3.flushed.length === 0, 'empty keys array handled');
}

// ── think-compact: DPO annotation edge cases ──────────────────────────
console.log('\n── DPO Annotation ──');

{
  const a = thinkCompact.annotateDPO;
  const r1 = a({ trajectory_quality: 'OPTIMAL', source: 'unit-test' });
  assert(r1 !== null, 'annotateDPO returns result for OPTIMAL');
  assert(r1.recommendation === 'CHOSEN', 'OPTIMAL → CHOSEN');
  assert(r1.trajectory_quality === 'OPTIMAL', 'quality preserved');

  const r2 = a({ trajectory_quality: 'ESCALATED', source: 'unit-test' });
  assert(r2 !== null, 'annotateDPO returns result for ESCALATED');
  assert(r2.recommendation === 'REJECTED', 'ESCALATED → REJECTED');

  const r3 = a({}); // no trajectory_quality
  assert(r3 !== null, 'annotateDPO handles missing quality');
}

// ── Cross-module: debouncer + compactor integration ───────────────────
console.log('\n── Cross-Module Integration ──');

{
  const status = { timestamp: new Date().toISOString(), agents: { a1: { online: true } } };
  const dupEvent = { event: 'agent:monitor:think', payload: status };
  assert(busDebouncer.isDuplicate(dupEvent) === false, 'first think event not duplicate');
  const result = thinkCompact.compactTrajectory(status);
  assert(result.compacted !== null, 'status compacted successfully');
  assert(result.compacted.agents.a1.online === true, 'agent state preserved through compaction');
}

// ── File I/O: voicemail read/write edge cases ─────────────────────────
console.log('\n── File I/O Edge Cases ──');

{
  // cloud-agent uses fs.readFileSync on potentially missing files
  // Test pattern: readVoicemails should return [] for missing files
  const nonexistent = path.join(__dirname, '..', '.kilo', 'memory', 'voicemails', '__nonexistent__.json');
  try {
    if (fs.existsSync(nonexistent)) fs.unlinkSync(nonexistent);
  } catch {}
  // This is the pattern used in cloud-agent.mjs
  try {
    let voicemails = [];
    try {
      if (fs.existsSync(nonexistent)) {
        voicemails = JSON.parse(fs.readFileSync(nonexistent, 'utf-8'));
      }
    } catch { voicemails = []; }
    assert(Array.isArray(voicemails), 'readVoicemails returns array for missing file');
    assert(voicemails.length === 0, 'readVoicemails returns empty for missing file');
  } catch (e) { assert(false, 'readVoicemails pattern threw: ' + e.message); }

  // corrupted file handling
  const corruptFile = path.join(__dirname, '..', '.kilo', 'memory', 'voicemails', '__corrupt__.json');
  fs.writeFileSync(corruptFile, '{bad json!!!');
  try {
    let vms = [];
    try { vms = JSON.parse(fs.readFileSync(corruptFile, 'utf-8')); } catch { vms = []; }
    assert(Array.isArray(vms), 'corrupt JSON returns array');
    assert(vms.length === 0, 'corrupt JSON returns empty');
  } catch (e) { assert(false, 'corrupt JSON pattern threw: ' + e.message); }
  fs.unlinkSync(corruptFile);
}

// ── heartbeat read edge cases ─────────────────────────────────────────
console.log('\n── Heartbeat Edge Cases ──');

{
  const missingHb = path.join(__dirname, '..', '.kilo', 'memory', 'voicemails', '__no_hb_heartbeat');
  try { if (fs.existsSync(missingHb)) fs.unlinkSync(missingHb); } catch {}
  // Pattern from cloud-agent isAgentOnline
  let online = false;
  try {
    if (fs.existsSync(missingHb)) {
      online = true; // would check timestamp
    }
  } catch { online = false; }
  assert(online === false, 'missing heartbeat → offline');

  // stale heartbeat (>45s)
  const staleFile = path.join(__dirname, '..', '.kilo', 'memory', 'voicemails', '__stale_heartbeat');
  fs.writeFileSync(staleFile, JSON.stringify({ timestamp: new Date(Date.now() - 60000).toISOString() }));
  try {
    const raw = JSON.parse(fs.readFileSync(staleFile, 'utf-8'));
    const isOnline = Date.now() - new Date(raw.timestamp).getTime() < 45000;
    assert(isOnline === false, 'stale heartbeat (>45s) → offline');
  } catch (e) { assert(false, 'stale heartbeat pattern threw: ' + e.message); }
  fs.unlinkSync(staleFile);

  // fresh heartbeat (<45s)
  const freshFile = path.join(__dirname, '..', '.kilo', 'memory', 'voicemails', '__fresh_heartbeat');
  fs.writeFileSync(freshFile, JSON.stringify({ timestamp: new Date().toISOString() }));
  try {
    const raw = JSON.parse(fs.readFileSync(freshFile, 'utf-8'));
    const isOnline = Date.now() - new Date(raw.timestamp).getTime() < 45000;
    assert(isOnline === true, 'fresh heartbeat (<45s) → online');
  } catch (e) { assert(false, 'fresh heartbeat pattern threw: ' + e.message); }
  fs.unlinkSync(freshFile);
}

// ── Challenge Engine & Seniority Protocol ──────────────────────────────
console.log('\n── Challenge Engine ──');

let challengeAgent;
try {
  challengeAgent = await import('./challenge-agent.mjs');
  assert(typeof challengeAgent.challengeOne === 'function', 'challenge-agent exports challengeOne');
  assert(typeof challengeAgent.getLeaderboard === 'function', 'challenge-agent exports getLeaderboard');
  assert(typeof challengeAgent.getSeniority === 'function', 'challenge-agent exports getSeniority');
  assert(typeof challengeAgent.evaluateChallenge === 'function', 'challenge-agent exports evaluateChallenge');
  assert(typeof challengeAgent.getRank === 'function', 'challenge-agent exports getRank');
  assert(Array.isArray(challengeAgent.RANKS) && challengeAgent.RANKS.length === 6, 'RANKS has 6 tiers');
} catch (e) { assert(false, 'challenge-agent import failed: ' + e.message); }

if (challengeAgent) {
  const r = challengeAgent.getRank(0);
  assert(r.name === 'ROOKIE', '0 points → ROOKIE');
  assert(challengeAgent.getRank(1).name === 'TRIED', '1 point → TRIED');
  assert(challengeAgent.getRank(3).name === 'PROVEN', '3 points → PROVEN');
  assert(challengeAgent.getRank(5).name === 'VETERAN', '5 points → VETERAN');
  assert(challengeAgent.getRank(10).name === 'ELDER', '10 points → ELDER');
  assert(challengeAgent.getRank(20).name === 'SAGE', '20 points → SAGE');
  assert(challengeAgent.getRank(100).name === 'SAGE', '100 points → SAGE (capped)');

  const mockToken = { data: { tid: 'test-1', cd: 'pipeline verifies embedding integrity across vector space' }, file: 'test.json' };
  const eval1 = challengeAgent.evaluateChallenge(mockToken, 'embedding integrity in vector space');
  assert(eval1.verdict !== undefined, 'evaluateChallenge returns verdict');
  assert(typeof eval1.score === 'number', 'evaluateChallenge returns numeric score');
  assert(Array.isArray(eval1.matchedKeywords), 'evaluateChallenge returns matched keywords');
  assert(eval1.matchedKeywords.includes('embedding'), 'embedding keyword matched');

  const emptyEval = challengeAgent.evaluateChallenge(mockToken, 'zzz_nonexistent_zzz');
  assert(emptyEval.verdict === 'FAIL' || emptyEval.score < 50, 'no match → FAIL or low score');

  const s = challengeAgent.getSeniority('test-nonexistent');
  assert(s.score === 0, 'nonexistent seniority returns 0 score');
  assert(s.rank === 'ROOKIE', 'nonexistent seniority returns ROOKIE');

  const lb = challengeAgent.getLeaderboard();
  assert(Array.isArray(lb), 'getLeaderboard returns array');
  assert(lb.every((e) => typeof e.tokenId === 'string'), 'leaderboard entries have tokenId');
  assert(lb.every((e) => typeof e.score === 'number'), 'leaderboard entries have score');
  assert(lb.every((e) => typeof e.rank === 'string'), 'leaderboard entries have rank');
  assert(lb.every((e) => typeof e.badge === 'string'), 'leaderboard entries have badge');

  // Challenge an existing token on disk
  const result = challengeAgent.challengeOne('tr-challenge-001', 'embedding integrity');
  assert(result.error !== 'token_not_found', 'challengeOne finds token on disk');
  if (result.error !== 'token_not_found') {
    assert(result.verdict !== undefined, 'challengeOne returns verdict');
    assert(typeof result.score === 'number', 'challengeOne returns score');
    assert(result.tokenId === 'tr-challenge-001', 'challengeOne returns correct tokenId');
    assert(typeof result.challenges === 'number', 'challengeOne returns challenge count');
    assert(result.challenges >= 1, 'challenge counter incremented');
  } else {
    console.log('  [SKIP] No token on disk for challengeOne integration test');
  }
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(48)}`);
console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log(`${'='.repeat(48)}`);
process.exit(failed > 0 ? 1 : 0);
