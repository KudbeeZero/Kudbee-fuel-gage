import { useFocusTrap } from '../../lib/focusTrap';
import type { RouteLatencyStats } from '../../hooks/useMiddlewareStatus';

interface RouteEntry {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  lastStatusCode: number;
}

function latencyBadge(ms: number): string {
  if (ms < 50) return 'text-emerald-400';
  if (ms < 200) return 'text-amber-400';
  return 'text-red-400';
}

interface Props {
  routes: RouteLatencyStats;
}

export function RouteLatencyMonitor({ routes }: Props) {
  const trapRef = useFocusTrap(Object.keys(routes).length > 0);

  const entries: [string, RouteEntry][] = Object.entries(routes).sort((a, b) => (b[1] as RouteEntry).avgMs - (a[1] as RouteEntry).avgMs);

  if (entries.length === 0) {
    return (
      <div className="text-zinc-500 text-sm p-4">No route latency data collected yet. Send some API requests to populate.</div>
    );
  }

  return (
    <div ref={trapRef} className="space-y-3" role="region" aria-label="Route Latency Table">
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        Route Latencies
        <span className="ml-2 text-xs font-normal text-zinc-500">(p50 · p95 · p99 avg)</span>
      </h3>
      <div className="overflow-x-auto rounded-xl border border-zinc-700/30">
        <table className="w-full text-xs font-mono" role="table">
          <thead>
            <tr className="border-b border-zinc-700/30 bg-zinc-800/50 text-zinc-400">
              <th className="text-left px-4 py-2 font-medium">Route</th>
              <th className="text-right px-3 py-2 font-medium">Count</th>
              <th className="text-right px-3 py-2 font-medium">p50</th>
              <th className="text-right px-3 py-2 font-medium">p95</th>
              <th className="text-right px-3 py-2 font-medium">p99</th>
              <th className="text-right px-3 py-2 font-medium">Avg</th>
              <th className="text-right px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 50).map(([route, stats]) => (
              <tr key={route} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-2 text-zinc-300 truncate max-w-[300px]" title={route}>
                  {route}
                </td>
                <td className="px-3 py-2 text-right text-zinc-500">{stats.count}</td>
                <td className={`px-3 py-2 text-right ${latencyBadge(stats.p50Ms)}`}>{stats.p50Ms}ms</td>
                <td className={`px-3 py-2 text-right ${latencyBadge(stats.p95Ms)}`}>{stats.p95Ms}ms</td>
                <td className={`px-3 py-2 text-right ${latencyBadge(stats.p99Ms)}`}>{stats.p99Ms}ms</td>
                <td className={`px-3 py-2 text-right ${latencyBadge(stats.avgMs)}`}>{stats.avgMs}ms</td>
                <td className="px-3 py-2 text-right">
                  <span className={stats.lastStatusCode < 400 ? 'text-emerald-400' : stats.lastStatusCode < 500 ? 'text-amber-400' : 'text-red-400'}>
                    {stats.lastStatusCode}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
