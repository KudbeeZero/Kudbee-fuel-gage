import { TelemetryEventSchema, type TelemetryEvent } from './schema';
import { EngineBus, KudbeeEvents } from './events';

const bus = new EngineBus();

export function setupTelemetryListeners(opts?: {
  url?: string;
  redis?: {
    publish: (channel: string, msg: string) => Promise<number>;
  };
}): () => void {
  const unsub = bus.subscribe(KudbeeEvents.trajectory, async (evt) => {
    const payload = evt.payload as TelemetryEvent;
    await publishTelemetryUpstash(payload, opts);
  });

  bus.subscribe(KudbeeEvents.governance_lock, async (evt) => {
    const payload = evt.payload as TelemetryEvent;
    await publishTelemetryUpstash(payload, opts);
  });

  bus.subscribe(KudbeeEvents.quota_exceeded, async (evt) => {
    console.warn('[telemetry] Quota exceeded — silencing outbound telemetry');
    const payload = evt.payload as TelemetryEvent;
    bus.emit(KudbeeEvents.quota_health, {
      ...payload,
      silenced: true,
      reason: 'UPSTASH_QUOTA_EXCEEDED'
    });
  });

  return () => {
    unsub();
  };
}

export interface QuotaHealthMetric {
  requestCount: number;
  quotaLimit: number;
  utilizationPct: number;
  backoffActive: boolean;
  circuitState: string;
  estimatedResetMs: number;
  timestamp: string;
}

export function publishQuotaHealth(
  metric: QuotaHealthMetric,
  opts?: {
    url?: string;
    redis?: {
      publish: (channel: string, msg: string) => Promise<number>;
    };
  }
): void {
  bus.emit(KudbeeEvents.quota_health, metric);

  const serialized = JSON.stringify(metric);
  const endpoint = opts?.url ?? process.env.UPSTASH_TELEMETRY_URL;

  if (opts?.redis && !endpoint) {
    opts.redis.publish('kudbee:quota_health', serialized).catch(() => {
      /* silent */
    });
    return;
  }

  if (!endpoint) {
    console.warn('[telemetry] No endpoint configured for quota health, dropping');
    return;
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: serialized
  }).catch(() => {
    /* silent */
  });
}

export async function publishTelemetry(
  evt: TelemetryEvent,
  opts?: {
    url?: string;
    redis?: {
      publish: (channel: string, msg: string) => Promise<number>;
    };
  }
): Promise<void> {
  const parsed = TelemetryEventSchema.parse(evt);
  const endpoint = opts?.url ?? process.env.UPSTASH_TELEMETRY_URL;

  if (opts?.redis && !endpoint) {
    await opts.redis.publish('kudbee:telemetry', JSON.stringify(parsed));
    return;
  }

  if (!endpoint) {
    console.warn('[telemetry] No endpoint configured, dropping event');
    return;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed)
  });

  if (!res.ok) throw new Error(`[telemetry] publish failed: ${res.status}`);
}

export async function publishTelemetryUpstash(
  evt: TelemetryEvent,
  opts?: {
    url?: string;
    redis?: {
      publish: (channel: string, msg: string) => Promise<number>;
    };
  }
): Promise<void> {
  const parsed = TelemetryEventSchema.parse(evt);
  const redis = opts?.redis;
  const endpoint = opts?.url ?? process.env.UPSTASH_TELEMETRY_URL;

  if (redis && endpoint) {
    await redis.publish('kudbee:telemetry', JSON.stringify(parsed));
    return;
  }

  if (redis) {
    await redis.publish('kudbee:telemetry', JSON.stringify(parsed));
    return;
  }

  if (!endpoint) {
    console.warn('[telemetry] No Upstash endpoint or redis configured, dropping event');
    return;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed)
  });

  if (!res.ok) throw new Error(`[telemetry] Upstash publish failed: ${res.status}`);
}
