/**
 * THINKBOX PR-010 — Performance Diagnostics
 *
 * Measures render latency, API latency, BUS throughput, SSE throughput,
 * timeline growth, memory growth, graph generation time, and mission
 * planning time. Generates an optimization report.
 */

export interface DiagnosticMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  status: 'ok' | 'warn' | 'critical';
  trend: 'stable' | 'increasing' | 'decreasing';
  samples: number[];
}

export interface DiagnosticsReport {
  timestamp: string;
  metrics: DiagnosticMetric[];
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  bottleneck: string | null;
  recommendations: string[];
}

export function collectDiagnostics(
  samples: Record<string, number[]>,
  thresholds?: Record<string, number>,
): DiagnosticsReport {
  const defaults: Record<string, { threshold: number; unit: string }> = {
    'render-latency-ms': { threshold: 16, unit: 'ms' },
    'api-latency-ms': { threshold: 200, unit: 'ms' },
    'bus-throughput-eps': { threshold: 100, unit: 'events/s' },
    'sse-throughput-eps': { threshold: 50, unit: 'events/s' },
    'timeline-length': { threshold: 1000, unit: 'records' },
    'memory-usage-mb': { threshold: 512, unit: 'MB' },
    'graph-gen-time-ms': { threshold: 500, unit: 'ms' },
    'mission-plan-time-ms': { threshold: 1000, unit: 'ms' },
    'event-queue-depth': { threshold: 100, unit: 'events' },
    'active-subscriptions': { threshold: 20, unit: 'subs' },
  };

  const metrics: DiagnosticMetric[] = [];
  let warnings = 0;
  let criticals = 0;

  for (const [name, values] of Object.entries(samples)) {
    const config = thresholds ? { threshold: thresholds[name] ?? defaults[name]?.threshold ?? 100, unit: defaults[name]?.unit ?? 'units' } : defaults[name] ?? { threshold: 100, unit: 'units' };
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const status = max > config.threshold * 2 ? 'critical' : max > config.threshold ? 'warn' : 'ok';
    const trend = values.length >= 3
      ? (values[values.length - 1] > values[values.length - 3] * 1.1 ? 'increasing' : values[values.length - 1] < values[values.length - 3] * 0.9 ? 'decreasing' : 'stable')
      : 'stable';

    if (status === 'warn') warnings++;
    if (status === 'critical') criticals++;

    metrics.push({ name, value: Math.round(avg * 100) / 100, unit: config.unit, threshold: config.threshold, status, trend, samples: values.slice(-10) });
  }

  const overallHealth = criticals > 0 ? 'unhealthy' : warnings > 2 ? 'degraded' : 'healthy';
  const bottleneck = metrics.find(m => m.status === 'critical')?.name ?? metrics.find(m => m.status === 'warn')?.name ?? null;
  const recommendations: string[] = [];

  if (bottleneck) recommendations.push(`Primary bottleneck: ${bottleneck} — consider optimization`);
  if (metrics.some(m => m.name === 'render-latency-ms' && m.status !== 'ok')) recommendations.push('Render latency above 16ms — consider code splitting');
  if (metrics.some(m => m.name === 'memory-usage-mb' && m.status !== 'ok')) recommendations.push('Memory usage high — check for leaks');
  if (metrics.some(m => m.name === 'event-queue-depth' && m.status !== 'ok')) recommendations.push('Event queue backing up — increase consumer capacity');

  return { timestamp: new Date().toISOString(), metrics, overallHealth, bottleneck, recommendations };
}
