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
// internet to our ingress. In production, set KUDBEE_API_URL to the public web
// dyno URL (e.g. https://kudbee-web.herokuapp.com). The localhost fallback is
// retained only for local development where both services share a host.
const INGEST_URL = process.env.KUDBEE_API_URL || 'http://localhost:3000';
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
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, detail: `${message} (Target: ${INGEST_URL})` };
  }
}

async function pollOnce(): Promise<void> {
  const raw = sampleRawTelemetry();
  const signal = extractSignal(raw);
  if (!signal) {
    // Silence is default: normal telemetry is dropped (no logging spam).
    return;
  }
  try {
    const payload = toIngestRequest(signal);
    const result = await egressIngest(payload);
    if (!result.ok) {
      console.warn(`[Sentinel] egress degraded: ${result.status} ${result.detail} (Target: ${INGEST_URL})`);
    } else {
      console.log(`[Sentinel] ingested ${payload.trace_id} (latency ${signal.latency_ms}ms)`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Sentinel] ingest validation failed (dropped):', message);
  }
}

function startPoller(): void {
  // Boot-time topology guard: on Heroku the Sentinel dyno is network-isolated
  // and CANNOT reach the web dyno via localhost. Egress will fail (fetch
  // errors) unless KUDBEE_API_URL is set to the public ingress URL.
  if (!process.env.KUDBEE_API_URL) {
    console.warn(
      '[Sentinel] ⚠️ KUDBEE_API_URL is undefined. Egressing to localhost, which will fail on Heroku isolated dynos.'
    );
  }
  console.log(`[Sentinel] heartbeat started — polling ${INGEST_URL}${INGEST_PATH} every ${POLL_INTERVAL_MS}ms`);
  void pollOnce();
  setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

export { startPoller };
