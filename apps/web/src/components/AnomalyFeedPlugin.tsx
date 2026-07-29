import { useEffect, useState } from 'react';
import { ShieldAlert, Activity, TrendingUp, Cpu } from 'lucide-react';
import { useEventStream } from '../hooks/useEventStream';

interface AuditEvent {
  id: string;
  ts: string;
  source: string;
  kind: string;
  data: {
    alertCount?: number;
    circuitState?: string;
    failureCount?: number;
    providerId?: string;
    requestCount?: number;
    oldestEntryMs?: number;
    key?: string;
  };
}

interface AnomalyStats {
  lastEvent: AuditEvent | null;
  anomalyCount: number;
  circuitState: string;
  rateSpikes: number;
  totalEvents: number;
}

export function AnomalyFeedPlugin() {
  const [stats, setStats] = useState<AnomalyStats>({
    lastEvent: null,
    anomalyCount: 0,
    circuitState: 'CLOSED',
    rateSpikes: 0,
    totalEvents: 0,
  });

  const { on } = useEventStream();

  useEffect(() => {
    const unsub = on('sentinel.audit', (event: AuditEvent) => {
      setStats((prev) => {
        const next = { ...prev, lastEvent: event, totalEvents: prev.totalEvents + 1 };
        switch (event.kind) {
          case 'firewall.anomaly_detected':
            next.anomalyCount = prev.anomalyCount + (event.data.alertCount || 1);
            break;
          case 'firewall.opened':
          case 'firewall.closed':
          case 'firewall.half_open':
            next.circuitState = event.data.circuitState || next.circuitState;
            break;
          case 'firewall.rate_check':
            next.rateSpikes = prev.rateSpikes + (event.data.requestCount || 0);
            break;
        }
        return next;
      });
    });

    return unsub;
  }, [on]);

  const stateColor =
    stats.circuitState === 'CLOSED'
      ? 'text-emerald-400'
      : stats.circuitState === 'OPEN'
        ? 'text-red-400'
        : stats.circuitState === 'HALF_OPEN'
          ? 'text-yellow-400'
          : 'text-slate-400';

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold text-zinc-200">Sentinel IQR Monitor</span>
        </div>
        <span className={`text-xs font-mono ${stateColor}`}>
          {stats.circuitState.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded bg-zinc-800 p-2 text-center">
          <div className="text-xs text-zinc-500">Anomalies</div>
          <div className="text-lg font-bold text-yellow-400">{stats.anomalyCount}</div>
        </div>
        <div className="rounded bg-zinc-800 p-2 text-center">
          <div className="text-xs text-zinc-500">Rate Spikes</div>
          <div className="text-lg font-bold text-emerald-400">{stats.rateSpikes}</div>
        </div>
      </div>

      {stats.lastEvent && (
        <div className="mt-3 border-t border-zinc-700 pt-2">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Activity className="h-3 w-3" />
            <span className="font-mono">
              {stats.lastEvent.kind.replace('firewall.', '')}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-zinc-600">
              {stats.lastEvent.ts?.slice(11, 19) || '--'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3" /> {stats.totalEvents} events
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Live SSE feed
        </span>
      </div>
    </div>
  );
}
