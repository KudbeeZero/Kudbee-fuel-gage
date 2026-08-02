/**
 * THINKBOX PR-010 — Diagnostics Panel
 *
 * Displays performance metrics: render latency, API latency, BUS throughput,
 * SSE throughput, timeline growth, memory growth, event queue depth,
 * active subscriptions. Shows trend indicators and bottleneck detection.
 */

import { useState, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface Metric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  status: 'ok' | 'warn' | 'critical';
  trend: 'stable' | 'increasing' | 'decreasing';
  samples: number[];
}

interface DiagnosticsProps {
  metrics?: Metric[];
  overallHealth?: string;
  bottleneck?: string | null;
  recommendations?: string[];
}

export function DiagnosticsPanel({
  metrics: externalMetrics,
  overallHealth = 'healthy',
  bottleneck = null,
  recommendations = [],
}: DiagnosticsProps) {
  const metrics: Metric[] = externalMetrics ?? [
    { name: 'render-latency-ms', value: 8.2, unit: 'ms', threshold: 16, status: 'ok', trend: 'stable', samples: [8, 8.5, 7.9, 8.2, 8.1, 8.3, 8.0, 8.2] },
    { name: 'api-latency-ms', value: 45, unit: 'ms', threshold: 200, status: 'ok', trend: 'stable', samples: [42, 48, 44, 45, 47, 43, 46, 45] },
    { name: 'bus-throughput-eps', value: 120, unit: 'events/s', threshold: 100, status: 'ok', trend: 'stable', samples: [115, 118, 122, 120, 119, 121, 120] },
    { name: 'sse-throughput-eps', value: 55, unit: 'events/s', threshold: 50, status: 'ok', trend: 'stable', samples: [52, 54, 56, 55, 53, 55, 54] },
    { name: 'timeline-length', value: 245, unit: 'records', threshold: 1000, status: 'ok', trend: 'increasing', samples: [200, 215, 230, 240, 245] },
    { name: 'memory-usage-mb', value: 156, unit: 'MB', threshold: 512, status: 'ok', trend: 'stable', samples: [150, 152, 155, 154, 156, 155, 156] },
    { name: 'event-queue-depth', value: 12, unit: 'events', threshold: 100, status: 'ok', trend: 'stable', samples: [10, 11, 13, 12, 11, 14, 12] },
    { name: 'active-subscriptions', value: 8, unit: 'subs', threshold: 20, status: 'ok', trend: 'stable', samples: [7, 8, 8, 7, 8, 9, 8] },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'critical': return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      default: return <Minus className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const trendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="w-3 h-3 text-amber-400" />;
      case 'decreasing': return <TrendingDown className="w-3 h-3 text-emerald-400" />;
      default: return <Minus className="w-3 h-3 text-slate-500" />;
    }
  };

  const healthColor = overallHealth === 'healthy' ? 'text-emerald-400' : overallHealth === 'degraded' ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-200">Diagnostics</h3>
            <p className="text-[10px] text-slate-500">8 metrics · Overall: <span className={healthColor}>{overallHealth}</span></p>
          </div>
        </div>
      </div>

      {bottleneck && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" />
          Bottleneck detected: {bottleneck}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {metrics.map(m => (
          <div key={m.name}
            className={`rounded-lg border p-3 ${m.status === 'critical' ? 'border-rose-500/20 bg-rose-500/5' : m.status === 'warn' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-800/40 bg-slate-950/40'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-slate-400">{m.name}</span>
              <div className="flex items-center gap-1">
                {trendIcon(m.trend)}
                {statusIcon(m.status)}
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-display font-bold ${m.status === 'critical' ? 'text-rose-400' : m.status === 'warn' ? 'text-amber-400' : 'text-slate-200'}`}>{m.value}</span>
              <span className="text-[9px] text-slate-600">{m.unit}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-slate-800/60 overflow-hidden">
              <div className={`h-full rounded-full ${m.status === 'critical' ? 'bg-rose-500' : m.status === 'warn' ? 'bg-amber-500' : 'bg-emerald-500/50'}`}
                style={{ width: `${Math.min(100, (m.value / m.threshold) * 100)}%` }} />
            </div>
            <div className="text-[8px] text-slate-600 mt-1">Threshold: {m.threshold}{m.unit}</div>
          </div>
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="rounded-lg border border-slate-800/40 bg-slate-950/40 p-3">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Recommendations</span>
          {recommendations.map((r, i) => (
            <div key={i} className="text-[9px] text-slate-400 mt-1">• {r}</div>
          ))}
        </div>
      )}
    </div>
  );
}
