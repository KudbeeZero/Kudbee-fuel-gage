import { TelemetryEventSchema, type TelemetryEvent } from './schema';

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
