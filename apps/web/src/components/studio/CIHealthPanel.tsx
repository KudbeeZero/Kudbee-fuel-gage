import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Activity,
  AlertTriangle,
  RefreshCw,
  GitBranch,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface CIHealth {
  timestamp: string;
  overall: 'HEALTHY' | 'DEGRADED' | 'UNSTABLE';
  latestRun: { name: string; conclusion: string; branch: string; event: string } | null;
  stats: { total: number; passed: number; failed: number; passRate: number };
  recentFailures: { name: string; branch: string; event: string; url: string }[];
  source: string;
}

const COLOR_MAP: Record<string, string> = {
  HEALTHY: 'emerald',
  DEGRADED: 'yellow',
  UNSTABLE: 'red',
};

export default function CIHealthPanel() {
  const [health, setHealth] = useState<CIHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiGet('/api/ci/health?record=true');
      setHealth(data as CIHealth);
    } catch (e: any) {
      setError(e?.message || 'CI health unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 30000);
    return () => clearInterval(interval);
  }, [reload]);

  const color = health ? COLOR_MAP[health.overall] || 'slate' : 'slate';
  const bgColor = `bg-${color}-900/20`;
  const borderColor = `border-${color}-700`;
  const textColor = `text-${color}-400`;

  return (
    <div className="space-y-4 p-4 text-sm font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-semibold text-zinc-100">CI Pipeline Health</h2>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Status Banner */}
      {health && (
        <div className={`${bgColor} ${borderColor} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {health.overall === 'HEALTHY' ? (
                <CheckCircle2 className={`w-5 h-5 ${textColor}`} />
              ) : health.overall === 'DEGRADED' ? (
                <AlertTriangle className={`w-5 h-5 ${textColor}`} />
              ) : (
                <XCircle className={`w-5 h-5 ${textColor}`} />
              )}
              <span className={`text-base font-bold ${textColor}`}>
                {health.overall}
              </span>
            </div>
            {health.latestRun && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <GitBranch className="w-3 h-3" />
                {health.latestRun.branch}
                <span className="text-zinc-600">|</span>
                {health.latestRun.event}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {health && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 mb-1">Total Runs</div>
            <div className="text-lg font-bold text-zinc-200">{health.stats.total}</div>
          </div>
          <div className="bg-zinc-900 border border-emerald-900/30 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 mb-1">Passed</div>
            <div className="text-lg font-bold text-emerald-400">{health.stats.passed}</div>
          </div>
          <div className="bg-zinc-900 border border-red-900/30 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 mb-1">Failed</div>
            <div className="text-lg font-bold text-red-400">{health.stats.failed}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 mb-1">Pass Rate</div>
            <div className={`text-lg font-bold ${health.stats.passRate >= 80 ? 'text-emerald-400' : health.stats.passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {health.stats.passRate}%
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {health && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-500">Pass Rate</span>
            <span className="text-[10px] text-zinc-400">{health.stats.passRate}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                health.stats.passRate >= 80
                  ? 'bg-emerald-500'
                  : health.stats.passRate >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, health.stats.passRate)}%` }}
            />
          </div>
        </div>
      )}

      {/* Recent Failures */}
      {health && health.recentFailures.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg">
          <div className="px-4 py-2 border-b border-zinc-800 text-[10px] text-zinc-600 uppercase tracking-wider">
            Recent Failures
          </div>
          <div className="divide-y divide-zinc-800 max-h-48 overflow-y-auto">
            {health.recentFailures.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <XCircle className="w-3 h-3 text-red-400" />
                  <span className="text-zinc-300">{f.name}</span>
                  <span className="text-zinc-600">|</span>
                  <GitBranch className="w-3 h-3 text-zinc-600" />
                  <span className="text-zinc-500">{f.branch}</span>
                </div>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {health && (
        <div className="flex items-center justify-between text-[10px] text-zinc-600">
          <span>Source: {health.source}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {!health && !loading && !error && (
        <div className="text-center py-8 text-xs text-zinc-600">
          <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
          No CI data available. Run "node scripts/ci-monitor.mjs" to populate.
        </div>
      )}
    </div>
  );
}
