/**
 * services/sentinel/src/redisPublisher.ts
 * ---------------------------------------------------------------------------
 * Redis-based event publisher that wires Sentinel's anomaly engine, circuit
 * breaker, and rate limiter events into the server's SSE fanout via the
 * kudbee:stream:audit Redis pub/sub channel.
 *
 * Used by wireFirewallEvents() as the onFirewallEvent callback so that every
 * firewall.anomaly_detected, firewall.opened, firewall.rate_check, etc. is
 * delivered live to the Control Tower frontend through the authenticated SSE
 * ticket pipeline.
 * ---------------------------------------------------------------------------
 */

export interface AuditEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type RedisPublishFn = (channel: string, message: string) => Promise<unknown>;

export function createRedisPublisher(
  publishFn: RedisPublishFn,
  anomalyPushUrl?: string
): (event: AuditEvent) => void {
  return (event: AuditEvent) => {
    const envelope = {
      id: `sentinel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: event.timestamp,
      source: 'sentinel',
      kind: event.type,
      data: event.payload,
    };

    publishFn('kudbee:stream:audit', JSON.stringify(envelope)).catch((e) => {
      console.error('[Sentinel] Redis publish failed:', e.message);
    });

    if (anomalyPushUrl && event.type === 'firewall.anomaly_detected') {
      fetch(anomalyPushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts: { unacknowledged: event.payload.alertCount } }),
      }).catch(() => {
        /* ignore — fire-and-forget */
      });
    }
  };
}
