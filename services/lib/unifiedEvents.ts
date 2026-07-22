/**
 * services/lib/unifiedEvents.ts
 * ---------------------------------------------------------------------------
 * Phase 39 — Unified SSE Event Bus
 *
 * Single-format event envelope published to kudbee:events:v2 alongside
 * existing legacy channels (30-day deprecation timer). The frontend hooks
 * consume v2 events for causal order and reduced connection count.
 *
 * Envelope:
 *   { id, ts, source, kind, data }
 *
 * Sources:  worker | sentinel | receptor | governance | hermes | system | groq
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from './redis.js';

const V2_CHANNEL = 'kudbee:events:v2';

export type EventSource = 'worker' | 'sentinel' | 'receptor' | 'governance' | 'hermes' | 'system' | 'groq';

let _counter = 0;
function nextId(): string {
  _counter += 1;
  return `${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function publishEvent(
  source: EventSource,
  kind: string,
  data: unknown,
  legacyChannel?: string
): Promise<void> {
  const envelope = {
    id: nextId(),
    ts: new Date().toISOString(),
    source,
    kind,
    data
  };

  const serialized = JSON.stringify(envelope);

  try {
    const redis = getRedisClient({ label: 'unified-events' });
    await Promise.allSettled([
      redis.publish(V2_CHANNEL, serialized),
      ...(legacyChannel ? [redis.publish(legacyChannel, JSON.stringify(data))] : [])
    ]);
  } catch { /* best-effort — events are fire-and-forget */ }
}
