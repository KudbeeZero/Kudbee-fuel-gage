/**
 * services/sentinel/src/poller.ts
 * ---------------------------------------------------------------------------
 * Edge Sentinel — Signal-to-Noise Ingestion Pipeline (cron heartbeat).
 *
 * Simulates pulling raw telemetry from the edge, validates it against the
 * canonical IngestRequestSchema (Zod), drops low-signal noise, and securely
 * egresses the parsed trace to the main backend at /api/telemetry/ingest with
 * the X-Agent-Pass header. Resilient-First: a failed egress is logged and
 * retried next tick — it never crashes the heartbeat loop.
 *
 * Zero-cost by design: native fetch only, no frameworks, single lightweight
 * timer. Optimized for a free-tier dyno (low memory, fast cold start).
 * ---------------------------------------------------------------------------
 */

import { IngestRequestSchema, type IngestRequest } from '@kudbee/types';

// Egress topology: the Sentinel dyno is network-isolated on Heroku and CANNOT
// reach the `web` dyno via `localhost`. Egress MUST route over the public
// internet to our ingress. The URL is resolved from (in priority order):
//   KUDBEE_API_URL  – explicit override (preferred)
//   API_BASE_URL    – generic deploy-platform variable
//   HEROKU_APP_NAME – auto-constructed as https://<app>.herokuapp.com
//   http://localhost:3000 – local development fallback only
function resolveIngestUrl(): string {
  if (process.env.KUDBEE_API_URL) return process.env.KUDBEE_API_URL;
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  if (process.env.HEROKU_APP_NAME) {
    return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[Sentinel] FATAL: running in production but no ingress URL configured. ' +
      'Set KUDBEE_API_URL, API_BASE_URL, or HEROKU_APP_NAME.'
    );
  }
  return 'http://localhost:3000';
}

const INGEST_URL = resolveIngestUrl();
const INGEST_PATH = '/api/telemetry/ingest';
const AGENT_PASS = process.env.SENTINEL_AGENT_PASS ?? '';
const POLL_INTERVAL_MS = Number(process.env.SENTINEL_POLL_MS ?? '2000');
const LATENCY_NOISE_THRESHOLD_MS = 1000;

let tick = 0;

interface RawTelemetrySample {
  trace_id: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  status: string;
  provider: string;
  project_name: string;
  latency_ms: number;
}

/** Simulates sampling a raw telemetry signal at the edge. */
function sampleRawTelemetry(): RawTelemetrySample {
  tick += 1;
  const noise = Math.random() > 0.7;
  return {
    trace_id: `edge-${Date.now()}-${tick}`,
    model: 'gemini-1.5-flash',
    tokens_in: 120 + Math.floor(Math.random() * 80),
    tokens_out: 40 + Math.floor(Math.random() * 60),
    cost: Number((Math.random() * 0.004).toFixed(5)),
    status: noise ? 'OK' : 'OK',
    provider: 'Google',
    project_name: 'kilo-fuel-gauge',
    latency_ms: noise ? 1200 + Math.floor(Math.random() * 800) : 40 + Math.floor(Math.random() * 200)
  };
}

/**
 * Signal-to-Noise filter: suppresses routine/low-signal samples so only
 * anomalies (e.g. latency spikes) survive to egress. Returns null for noise.
 */
function extractSignal(sample: RawTelemetrySample): RawTelemetrySample | null {
  if (sample.latency_ms < LATENCY_NOISE_THRESHOLD_MS) return null;
  return sample;
}

/** Strictly formats a validated trace for egress. */
function toIngestRequest(sample: RawTelemetrySample): IngestRequest {
  const parsed = IngestRequestSchema.parse({
    trace_id: sample.trace_id,
    model: sample.model,
    tokens_in: sample.tokens_in,
    tokens_out: sample.tokens_out,
    cost: sample.cost,
    status: sample.status,
    provider: sample.provider,
    project_name: sample.project_name
  });
  return parsed;
}

interface EgressResult {
  ok: boolean;
  status: number;
  detail: string;
}

/** Safely coerce an unknown thrown value into a string (Resilient-First). */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Securely pushes a validated trace to the main backend. */
async function egressIngest(payload: IngestRequest): Promise<EgressResult> {
  try {
    const res = await fetch(`${INGEST_URL}${INGEST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Pass': AGENT_PASS
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, detail: text.slice(0, 200) };
  } catch (err) {
    const message = toErrorMessage(err);
    return { ok: false, status: 0, detail: message };
  }
}

// --- Resilient-First Egress State -------------------------------------------
// Prevents log-spam (e.g. `egress degraded: 0 fetch failed`) during backend
// sleep states / network drops. We track consecutive failures and only log a
// warning on state transitions or every Nth failure, then back off quietly.
let consecutiveFailures = 0;
const MAX_QUIET_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30000;

/** Cost-zero exponential backoff: returns ms to wait before the next egress. */
function nextBackoffMs(): number {
  const attempt = Math.min(consecutiveFailures, 8);
  const backoff = BACKOFF_BASE_MS * 2 ** attempt;
  return Math.min(backoff, BACKOFF_MAX_MS);
}

// --- Real exponential backoff loop (replaces fixed setInterval) ---
// When egress fails we schedule the next poll after `nextBackoffMs()`
// instead of polling at a fixed 2s cadence. A circuit breaker pauses
// for 60s after 10 consecutive failures to avoid saturating a dead target.
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_PAUSE_MS = 60_000;
let _pollerTimeout: ReturnType<typeof setTimeout> | null = null;

async function pollOnce(): Promise<void> {
  const raw = sampleRawTelemetry();
  const signal = extractSignal(raw);
  if (!signal) {
    scheduleNext(0);
    return;
  }
  try {
    const payload = toIngestRequest(signal);
    const result = await egressIngest(payload);
    if (!result.ok) {
      consecutiveFailures += 1;
      if (consecutiveFailures === 1 || consecutiveFailures % MAX_QUIET_RETRIES === 0) {
        console.warn(
          `[Sentinel] egress degraded (attempt ${consecutiveFailures}, next retry in ~${nextBackoffMs()}ms):`,
          result.status,
          result.detail
        );
      }
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        console.warn(`[Sentinel] circuit breaker engaged — pausing for ${CIRCUIT_BREAKER_PAUSE_MS / 1000}s`);
        scheduleNext(CIRCUIT_BREAKER_PAUSE_MS);
      } else {
        scheduleNext(nextBackoffMs());
      }
    } else {
      if (consecutiveFailures > 0) {
        console.log(`[Sentinel] egress recovered after ${consecutiveFailures} failures`);
      }
      consecutiveFailures = 0;
      console.log(`[Sentinel] ingested ${payload.trace_id} (latency ${signal.latency_ms}ms)`);
      scheduleNext(0);
    }
  } catch (err) {
    const message = toErrorMessage(err);
    console.warn('[Sentinel] ingest validation failed (dropped):', message);
    scheduleNext(0);
  }
}

function scheduleNext(delayMs: number): void {
  if (_pollerTimeout) clearTimeout(_pollerTimeout);
  _pollerTimeout = setTimeout(() => void pollOnce(), Math.max(delayMs, POLL_INTERVAL_MS));
}

function startPoller(): void {
  console.log(`[Sentinel] heartbeat started — polling ${INGEST_URL}${INGEST_PATH} (backoff up to ${BACKOFF_MAX_MS}ms, circuit breaker at ${CIRCUIT_BREAKER_THRESHOLD} failures)`);
  void pollOnce();
}

export { startPoller };
