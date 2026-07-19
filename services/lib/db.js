/**
 * services/lib/db.js
 * ---------------------------------------------------------------------------
 * getDbPool — the resilient Neon Postgres connection factory.
 *
 * This is the Resilient-First system of record. It:
 *   - Creates a single shared `pg.Pool` (never per-request clients).
 *   - Is LAZY + TOLERANT: if DATABASE_URL is missing or the pool errors, it
 *     logs a clear warning and marks the pool unhealthy instead of crashing.
 *   - Exposes a memory store fallback so the server still boots and runs in
 *     local/dev/CI when Postgres is unavailable. SQLite is fully removed.
 *
 * Callers must use `runQuery` / `runInsert` (below) which route to Neon when
 * healthy and transparently fall back to the in-memory store otherwise. Never
 * `require('sqlite3')` anywhere in the codebase.
 * ---------------------------------------------------------------------------
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';

let _pool = null;
let _healthy = false;

/**
 * Returns the shared Neon Postgres Pool, or null when DATABASE_URL is unset.
 * The pool is created once and wired with resilient error handling so a
 * transient outage degrades to the memory store instead of crashing.
 * @returns {import('pg').Pool | null}
 */
export function getDbPool() {
  if (!DATABASE_URL) {
    if (_pool !== null) return _pool; // already resolved to "disabled"
    console.warn(
      '[DB] DATABASE_URL not set — Neon Postgres disabled. ' +
        'Falling back to in-memory store (Resilient-First degrade).'
    );
    _pool = null; // sentinel: explicitly disabled
    return _pool;
  }

  if (_pool) return _pool;

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Neon closes idle connections; allow the pool to transparently reconnect.
    keepAlive: true
  });

  pool.on('error', (err) => {
    _healthy = false;
    console.warn('[DB] Pool error (degrading to in-memory):', err.message);
  });

  pool.on('connect', () => {
    _healthy = true;
  });

  console.log('[DB] Neon Postgres Pool initialized from DATABASE_URL');
  _pool = pool;
  return _pool;
}

/** True when the Neon pool is configured AND has not reported an error. */
export function isDbHealthy() {
  return Boolean(DATABASE_URL) && _healthy;
}

/** Release the pool (used on graceful shutdown). Safe to call when disabled. */
export async function closeDbPool() {
  if (_pool) {
    try {
      await _pool.end();
    } catch {
      /* ignore */
    }
    _pool = null;
    _healthy = false;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback store (Resilient-First degrade path).
// Mirrors the canonical tables so endpoints behave identically with/without
// Postgres. Cleared on process exit; NOT persisted across restarts.
// ---------------------------------------------------------------------------

const memory = {
  telemetry_logs: [],
  telemetry_traces: [],
  telemetry_vectors: [],
  user_memories: [],
  security_violations: [],
  governance_actions: [],
  think: []
};

let _seq = 1;
const nextId = () => _seq++;

function rowToObject(row) {
  return row;
}

/**
 * Run a SELECT against the healthy Neon pool, or the in-memory fallback.
 * Supports a minimal subset of the queries used by the ingestion server.
 */
export async function runQuery(sql, params = []) {
  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    const res = await pool.query(sql, params);
    return res.rows;
  }
  return runQueryMemory(sql, params);
}

/** Run an INSERT/UPDATE/DELETE against Neon or the in-memory fallback. */
export async function runInsert(sql, params = []) {
  const pool = getDbPool();
  if (pool && isDbHealthy()) {
    const res = await pool.query(sql, params);
    return { id: res.rows[0]?.id ?? null, changes: res.rowCount ?? 0 };
  }
  return runInsertMemory(sql, params);
}

// --- Minimal in-memory SQL interpreter for the fallback path -----------------
// Not a full SQL engine — only recognizes the exact statement shapes emitted by
// this server. Anything unrecognized returns an empty result to stay resilient.

function runQueryMemory(sql, params = []) {
  const s = sql.trim().replace(/\s+/g, ' ');

  if (/FROM telemetry_traces/.test(s) || /FROM telemetry_logs/.test(s)) {
    const table = /telemetry_logs/.test(s) ? 'telemetry_logs' : 'telemetry_traces';
    const rows = [...memory[table]].sort(
      (a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at)
    );
    const limitMatch = s.match(/LIMIT \$?\d+/i);
    if (limitMatch) {
      const lim = Number(params[params.length - 1]) || 100;
      return rows.slice(0, lim);
    }
    return rows;
  }
  if (/FROM security_violations/.test(s)) {
    return [...memory.security_violations].reverse();
  }
  if (/FROM think/.test(s)) {
    return [...memory.think].reverse();
  }
  if (/FROM governance_actions/.test(s)) {
    return [...memory.governance_actions].reverse();
  }
  if (/COALESCE\(SUM\(value_score\)/.test(s)) {
    return [{ total: memory.governance_actions.reduce((a, r) => a + (r.value_score || 0), 0) }];
  }
  if (/COUNT\(\*\) AS count FROM governance_actions/.test(s)) {
    return [{ count: memory.governance_actions.length }];
  }
  if (/COUNT\(DISTINCT trace_id\) AS count FROM governance_actions/.test(s)) {
    return [{ count: new Set(memory.governance_actions.map((r) => r.trace_id)).size }];
  }
  if (/SUM\(tokens_in \+ tokens_out\)/.test(s)) {
    const total = memory.telemetry_traces.reduce(
      (a, r) => a + (Number(r.tokens_in) || 0) + (Number(r.tokens_out) || 0),
      0
    );
    return [{ total }];
  }
  if (/SUM\(cost\) as total FROM telemetry_traces/.test(s)) {
    const now = Date.now();
    const since = params[0] ? Date.parse(params[0]) : 0;
    const total = memory.telemetry_traces
      .filter((r) => !since || new Date(r.timestamp).getTime() >= since)
      .reduce((a, r) => a + (Number(r.cost) || 0), 0);
    return [{ total }];
  }
  if (/COUNT\(DISTINCT model\)/.test(s)) {
    return [{ count: new Set(memory.telemetry_traces.map((r) => r.model)).size }];
  }
  if (/SELECT 1 as ok/.test(s)) {
    return [{ ok: 1 }];
  }
  // Unknown read → empty, resilient.
  return [];
}

function runInsertMemory(sql, params = []) {
  const s = sql.trim().replace(/\s+/g, ' ');

  if (/INTO telemetry_traces/.test(s)) {
    const [trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name] = params;
    const row = {
      id: nextId(),
      trace_id, model, tokens_in, tokens_out, cost, status, provider, project_name,
      timestamp: new Date().toISOString()
    };
    memory.telemetry_traces.push(row);
    memory.telemetry_logs.push({ ...row, created_at: row.timestamp });
    return { id: row.id, changes: 1 };
  }
  if (/INTO telemetry_vectors/.test(s)) {
    const [trace_id, thought_summary, reasoning, model, vector] = params;
    const row = {
      id: nextId(), trace_id, thought_summary, reasoning, model, vector,
      timestamp: new Date().toISOString()
    };
    memory.telemetry_vectors.push(row);
    memory.user_memories.push({
      id: nextId(), agent_id: null, thought_summary, reasoning, model,
      embedding: vector, created_at: new Date().toISOString()
    });
    return { id: row.id, changes: 1 };
  }
  if (/INTO security_violations/.test(s)) {
    const [payload, violation_reason] = params;
    const row = { id: nextId(), payload, violation_reason, timestamp: new Date().toISOString() };
    memory.security_violations.push(row);
    return { id: row.id, changes: 1 };
  }
  if (/INTO governance_actions/.test(s)) {
    const [, trace_id, action, type, agent_id, signature, signed_payload, value_score, note] = params;
    const row = {
      id: nextId(), trace_id, action: action || 'VERIFY', type: type || 'GOVERNANCE_ACTION',
      agent_id, signature, signed_payload, value_score, note, timestamp: new Date().toISOString()
    };
    memory.governance_actions.push(row);
    return { id: row.id, changes: 1 };
  }
  if (/INTO user_memories/.test(s)) {
    const [agent_id, thought_summary, reasoning, model, embedding] = params;
    const row = {
      id: nextId(), agent_id, thought_summary, reasoning, model, embedding,
      created_at: new Date().toISOString()
    };
    memory.user_memories.push(row);
    return { id: row.id, changes: 1 };
  }
  if (/INTO think/.test(s)) {
    const [agent_id, task, phase, thought, tokens_in, tokens_out, model] = params;
    const row = {
      id: nextId(), agent_id, task, phase, thought,
      tokens_in: Number(tokens_in) || 0, tokens_out: Number(tokens_out) || 0,
      model: model || 'reasoning', created_at: new Date().toISOString()
    };
    memory.think.push(row);
    return { id: row.id, changes: 1 };
  }
  if (/DELETE FROM telemetry_traces/.test(s)) {
    const n = memory.telemetry_traces.length;
    memory.telemetry_traces = [];
    return { id: null, changes: n };
  }
  if (/DELETE FROM security_violations WHERE id/.test(s)) {
    const before = memory.security_violations.length;
    memory.security_violations = memory.security_violations.filter((r) => r.id !== params[0]);
    return { id: null, changes: before - memory.security_violations.length };
  }
  if (/UPDATE telemetry_traces SET value_score/.test(s)) {
    const [score, trace_id] = params;
    const row = memory.telemetry_traces.find((r) => r.trace_id === trace_id);
    if (row) row.value_score = score;
    return { id: null, changes: row ? 1 : 0 };
  }
  return { id: null, changes: 0 };
}

export { memory as _memoryStore };
export default getDbPool;
