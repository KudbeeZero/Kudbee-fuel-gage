import type { CircuitBreaker, CircuitBreakerEventCallback } from './circuitBreaker';
import type { SlidingWindowRateLimiter } from './rateLimiter';

export interface AnomalyRule {
  id: string;
  metric: 'TOKEN_SURGE' | 'COST_SPIKE' | 'LATENCY_SPIKE' | 'ERROR_RATE';
  threshold: number;
  windowMs: number;
  cooldownMs: number;
}

export interface AnomalyAlert {
  ruleId: string;
  metric: string;
  actualValue: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

interface MetricSnapshot {
  timestamp: number;
  tokens: number;
  cost: number;
  latencyMs: number;
  errors: number;
  total: number;
}

export class AnomalyEngine {
  private rules: AnomalyRule[];
  private alerts: AnomalyAlert[];
  private snapshots: MetricSnapshot[];
  private cooldowns: Map<string, number>;

  constructor(rules: AnomalyRule[] = []) {
    this.rules = rules;
    this.alerts = [];
    this.snapshots = [];
    this.cooldowns = new Map();
  }

  addRule(rule: AnomalyRule): void {
    if (!this.rules.find((r) => r.id === rule.id)) {
      this.rules.push(rule);
    }
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  record(metric: { tokens: number; cost: number; latencyMs: number; errors: number; total: number }): AnomalyAlert[] {
    const snapshot: MetricSnapshot = {
      timestamp: Date.now(),
      ...metric
    };
    this.snapshots.push(snapshot);

    const maxAge = Math.max(...this.rules.map((r) => r.windowMs), 60_000);
    const cutoff = Date.now() - maxAge;
    this.snapshots = this.snapshots.filter((s) => s.timestamp >= cutoff);

    const newAlerts: AnomalyAlert[] = [];

    for (const rule of this.rules) {
      const lastCooldown = this.cooldowns.get(rule.id) ?? 0;
      if (Date.now() - lastCooldown < rule.cooldownMs) continue;

      const windowed = this.snapshots.filter((s) => Date.now() - s.timestamp < rule.windowMs);
      if (windowed.length === 0) continue;

      let actualValue: number;
      switch (rule.metric) {
        case 'TOKEN_SURGE':
          actualValue = windowed.reduce((s, m) => s + m.tokens, 0);
          break;
        case 'COST_SPIKE':
          actualValue = windowed.reduce((s, m) => s + m.cost, 0);
          break;
        case 'LATENCY_SPIKE':
          actualValue = windowed.reduce((s, m) => s + m.latencyMs, 0) / windowed.length;
          break;
        case 'ERROR_RATE':
          actualValue = windowed.reduce((s, m) => s + m.errors, 0) / Math.max(1, windowed.reduce((s, m) => s + m.total, 1));
          break;
        default:
          continue;
      }

      if (actualValue > rule.threshold) {
        const alert: AnomalyAlert = {
          ruleId: rule.id,
          metric: rule.metric,
          actualValue,
          threshold: rule.threshold,
          timestamp: new Date().toISOString(),
          acknowledged: false
        };
        newAlerts.push(alert);
        this.alerts.push(alert);
        this.cooldowns.set(rule.id, Date.now());
      }
    }

    return newAlerts;
  }

  getAlerts(): AnomalyAlert[] {
    return [...this.alerts];
  }

  acknowledgeAlert(index: number): void {
    if (this.alerts[index]) {
      this.alerts[index]!.acknowledged = true;
    }
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  get activeRules(): AnomalyRule[] {
    return [...this.rules];
  }

  get snapshotCount(): number {
    return this.snapshots.length;
  }
}

export function createDefaultRules(): AnomalyRule[] {
  return [
    {
      id: 'token-surge-5m',
      metric: 'TOKEN_SURGE',
      threshold: 100_000,
      windowMs: 300_000,
      cooldownMs: 600_000
    },
    {
      id: 'cost-spike-15m',
      metric: 'COST_SPIKE',
      threshold: 50,
      windowMs: 900_000,
      cooldownMs: 1_800_000
    },
    {
      id: 'latency-spike-5m',
      metric: 'LATENCY_SPIKE',
      threshold: 5000,
      windowMs: 300_000,
      cooldownMs: 600_000
    },
    {
      id: 'error-rate-5m',
      metric: 'ERROR_RATE',
      threshold: 0.1,
      windowMs: 300_000,
      cooldownMs: 600_000
    }
  ];
}

export function wireFirewallEvents(
  rateLimiter: SlidingWindowRateLimiter,
  circuitBreaker: CircuitBreaker,
  anomalyEngine: AnomalyEngine,
  onFirewallEvent: (event: { type: string; payload: Record<string, unknown>; timestamp: string }) => void
): () => void {
  const unsub = circuitBreaker.onEvent((cbEvent) => {
    onFirewallEvent({
      type: `firewall.${cbEvent.type.toLowerCase()}`,
      payload: {
        providerId: cbEvent.providerId,
        circuitState: cbEvent.state,
        failureCount: cbEvent.failureCount
      },
      timestamp: cbEvent.timestamp
    });
  });

  const rateCheckInterval = setInterval(() => {
    const rateStats = rateLimiter.stats('global');
    if (rateStats.count > 0) {
      onFirewallEvent({
        type: 'firewall.rate_check',
        payload: {
          key: 'global',
          requestCount: rateStats.count,
          oldestEntryMs: rateStats.oldestMs
        },
        timestamp: new Date().toISOString()
      });
    }
  }, 30_000);

  const anomalyCheckInterval = setInterval(() => {
    const alerts = anomalyEngine.getAlerts().filter((a) => !a.acknowledged);
    if (alerts.length > 0) {
      onFirewallEvent({
        type: 'firewall.anomaly_detected',
        payload: {
          alertCount: alerts.length,
          latest: alerts[alerts.length - 1]
        },
        timestamp: new Date().toISOString()
      });
    }
  }, 60_000);

  return () => {
    unsub();
    clearInterval(rateCheckInterval);
    clearInterval(anomalyCheckInterval);
  };
}
