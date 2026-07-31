#!/usr/bin/env node

try {
  process.loadEnvFile('.env');
} catch {
  // A local .env is optional; hosting environments provide process.env directly.
}

import { Pool } from 'pg';

const DEFAULT_DB_POOL_MAX = 5;
const MIN_DB_POOL_MAX = 1;
const MAX_DB_POOL_MAX = 20;
const DEFAULT_MONTHLY_DB_OPERATION_BUDGET = 500_000;
const PROVIDER_METERING_UNAVAILABLE = 'provider-metered/unavailable';

function readInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const poolMax = readInteger('DB_POOL_MAX', DEFAULT_DB_POOL_MAX, MIN_DB_POOL_MAX, MAX_DB_POOL_MAX);
const activeLimit = readInteger('DB_ACTIVE_CONNECTION_LIMIT', poolMax, 0, Number.MAX_SAFE_INTEGER);
const monthlyBudget = readInteger(
  'MONTHLY_DB_OPERATION_BUDGET',
  DEFAULT_MONTHLY_DB_OPERATION_BUDGET,
  0,
  Number.MAX_SAFE_INTEGER
);

function countValue(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
}

function normalizePoolState(info) {
  if (!info || typeof info !== 'object') return null;

  const total = countValue(info.totalCount ?? info.total);
  const idle = countValue(info.idleCount ?? info.idle);
  const waiting = countValue(info.waitingCount ?? info.waiting);
  const active = countValue(info.activeCount ?? info.active);

  if (total === null && idle === null && waiting === null && active === null) return null;
  return {
    active: active ?? (total !== null && idle !== null ? Math.max(0, total - idle) : null),
    idle,
    waiting,
    total,
  };
}

async function readHealthEndpoint(endpoint) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const body = await response.json();
    const poolInfo =
      body?.services?.postgres?.poolInfo ?? body?.postgres?.poolInfo ?? body?.poolInfo;
    const state = normalizePoolState(poolInfo);
    return state ? { source: 'health-endpoint', state } : null;
  } catch {
    return null;
  }
}

async function readDatabase() {
  if (!process.env.DATABASE_URL) return null;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Read-only observation. pg_stat_activity exposes the database session
    // state without requiring an application-sized pool or any write query.
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE state = 'active')::int AS active,
        COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
        COUNT(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL)::int AS waiting,
        COUNT(*)::int AS total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const state = normalizePoolState(result.rows[0]);
    return state ? { source: 'pg_stat_activity', state } : null;
  } catch {
    return null;
  } finally {
    try {
      await pool.end();
    } catch {
      // The monitor remains non-failing when the database is unavailable.
    }
  }
}

async function main() {
  const endpoint = process.env.DB_HEALTH_ENDPOINT || process.env.STAGING_HEALTH_ENDPOINT;
  let observation = endpoint ? await readHealthEndpoint(endpoint) : null;
  if (!observation) observation = await readDatabase();

  const pool = observation?.state ?? { active: null, idle: null, waiting: null, total: null };
  const thresholdExceeded = pool.active !== null && pool.active > activeLimit;

  const report = {
    status: observation ? (thresholdExceeded ? 'threshold_exceeded' : 'ok') : 'unavailable',
    source: observation?.source ?? 'unavailable',
    readOnly: true,
    pool: {
      active: pool.active,
      idle: pool.idle,
      waiting: pool.waiting,
      total: pool.total,
      max: poolMax,
      activeLimit,
    },
    budget: {
      status: PROVIDER_METERING_UNAVAILABLE,
      monthlyOperationBudget: monthlyBudget,
      used: null,
      remaining: null,
    },
    timestamp: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (thresholdExceeded) process.exitCode = 1;
}

main().catch(() => {
  // Connectivity and provider-metering failures are observations, not budget
  // violations. Keep the command safe for automated agents and cron jobs.
  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'unavailable',
        source: 'unavailable',
        readOnly: true,
        pool: { active: null, idle: null, waiting: null, total: null, max: poolMax, activeLimit },
        budget: {
          status: PROVIDER_METERING_UNAVAILABLE,
          monthlyOperationBudget: monthlyBudget,
          used: null,
          remaining: null,
        },
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
});
