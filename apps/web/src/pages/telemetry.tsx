import { useUIStore } from '../store/uiStore';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { getFormattedCost } from '../utils/currency';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Cpu,
  DollarSign,
  Server,
  Terminal,
  Zap,
  Star
} from 'lucide-react';
import { TerminalHUDTicker } from '../components/TerminalHUDTicker';
import { DiagnosticTicker } from '../components/dashboard/DiagnosticTicker';
import { BatcherIndicator } from '../components/BatcherIndicator';
import type { DashboardSummary, TelemetryLog } from '../App';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface TelemetryCardProps {
  title: string;
  value: React.ReactNode;
  prefix?: string;
  suffix?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

function TelemetryCard({ title, value, prefix = '', suffix = '', icon: Icon }: TelemetryCardProps) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden group" id={`telemetry-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-emerald-500/70" />}
        <div className="text-slate-500 text-xs font-semibold uppercase tracking-widest">{title}</div>
      </div>
      <div className="font-mono text-3xl text-slate-100 flex items-baseline gap-1">
        {prefix && <span className="text-emerald-500/50 text-xl">{prefix}</span>}
        {value}
        {suffix && <span className="text-emerald-500/50 text-xl">{suffix}</span>}
      </div>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${star <= Math.floor(rating) ? 'fill-emerald-400 text-emerald-400' : star === Math.ceil(rating) ? 'fill-emerald-400/30 text-emerald-400' : 'fill-slate-800 text-slate-800'}`}
        />
      ))}
    </div>
  );
}

interface TelemetryPageProps {
  liveStats: {
    inTokens: number;
    outTokens: number;
    cost: number;
    totalRequests: number;
    activeModels: number;
    errorRate: number;
    totalTokens: number;
    sink_token_balance: number;
    total_24h_cost: number;
    total_active_models: number;
    pgSizeBytes: number;
    redisSizeBytes: number;
    pgHealthy: boolean;
    redisHealthy: boolean;
  };
  currency: 'USD' | 'EUR' | 'GBP';
  circuitBreakerData: { name: string; success: number; failure: number }[];
  models: { name: string; org: string; costIn: string; costOut: string; speed: number; quality: number; status: string }[];
  displayDensity: 'Compact' | 'Standard' | 'Comfortable';
}

export function TelemetryPage({ liveStats, currency, circuitBreakerData, models, displayDensity }: TelemetryPageProps) {
  const setConsoleExpanded = useUIStore((state) => state.setConsoleExpanded);

  return (
    <PanelErrorBoundary panel="TELEMETRY">
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TelemetryCard
          title="Input Tokens"
          value={liveStats.inTokens.toLocaleString()}
          icon={Cpu}
        />
        <TelemetryCard
          title="Output Tokens"
          value={liveStats.outTokens.toLocaleString()}
          icon={ArrowRightLeft}
        />
        <TelemetryCard
          title="Live Pipeline Cost"
          value={getFormattedCost(liveStats.cost, currency, 4)}
          icon={DollarSign}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TelemetryCard
          title="Total Requests"
          value={liveStats.totalRequests.toLocaleString()}
          icon={Activity}
        />
        <TelemetryCard
          title="Error Rate"
          value={`${liveStats.errorRate.toFixed(2)}%`}
          icon={AlertTriangle}
        />
        <TelemetryCard
          title="Active Models"
          value={liveStats.activeModels.toLocaleString()}
          icon={Server}
        />
      </div>

      <TerminalHUDTicker />
      <DiagnosticTicker />
      <div className="flex items-center justify-end mb-2">
        <BatcherIndicator />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden" id="dashboard-matrix">
          <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
            <h2 className="font-display font-semibold text-slate-200">Execution Matrix</h2>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500/70" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Live Routes</span>
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse md:min-w-[700px] block md:table">
              <thead className="hidden md:table-header-group">
                <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-slate-950/50">
                  <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Model Framework</th>
                  <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Cost / 1M (In|Out)</th>
                  <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Speed Velocity</th>
                  <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800`}>Output Quality</th>
                  <th className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} font-medium border-b border-slate-800 text-right`}>Route State</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-800/50 block md:table-row-group p-3 md:p-0 space-y-3 md:space-y-0">
                {models.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center">
                    <div className="font-mono text-xs text-slate-500">No model routing data available</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-600">Telemetry ingestion will populate as traces arrive</div>
                  </td></tr>
                ) : (
                  models.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors group block md:table-row bg-slate-900/60 border border-slate-800 md:border-none rounded-xl p-4 md:p-0 mb-4 md:mb-0 space-y-2.5 md:space-y-0 shadow-[0_0_12px_rgba(52,211,153,0.04)] md:shadow-none">
                    <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} flex md:table-cell justify-between md:justify-start items-center w-full md:w-auto border-b border-slate-900/40 md:border-none pb-2.5 md:pb-0`}>
                      <span className="md:hidden text-slate-500 text-[10px] uppercase font-mono font-bold mr-2">Model:</span>
                      <div className="text-right md:text-left">
                        <div className="font-medium text-slate-200">{m.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{m.org}</div>
                      </div>
                    </td>
                    <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} flex md:table-cell justify-between md:justify-start items-center w-full md:w-auto border-b border-slate-900/40 md:border-none pb-2.5 md:pb-0`}>
                      <span className="md:hidden text-slate-500 text-[10px] uppercase font-mono font-bold mr-2">Cost/1M:</span>
                      <div className="flex flex-col md:flex-row md:items-center font-mono text-slate-300 tracking-wide">
                        <span>{getFormattedCost(parseFloat(m.costIn), currency, 2)}</span>
                        <span className="text-slate-600 mx-1 hidden md:inline">|</span>
                        <span>{getFormattedCost(parseFloat(m.costOut), currency, 2)}</span>
                      </div>
                    </td>
                    <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} flex md:table-cell justify-between md:justify-start items-center w-full md:w-auto border-b border-slate-900/40 md:border-none pb-2.5 md:pb-0`}>
                      <span className="md:hidden text-slate-500 text-[10px] uppercase font-mono font-bold mr-2">Speed:</span>
                      <div className="w-24 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                        <div className="absolute top-0 left-0 h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${m.speed}%` }}></div>
                      </div>
                    </td>
                    <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5' : 'px-6 py-4'} flex md:table-cell justify-between md:justify-start items-center w-full md:w-auto border-b border-slate-900/40 md:border-none pb-2.5 md:pb-0`}>
                      <span className="md:hidden text-slate-500 text-[10px] uppercase font-mono font-bold mr-2">Quality:</span>
                      <StarRating rating={m.quality} />
                    </td>
                    <td className={`${displayDensity === 'Compact' ? 'px-3 py-2.5 text-xs' : 'px-6 py-4'} text-right flex md:table-cell justify-between md:justify-end items-center w-full md:w-auto`}>
                      <span className="md:hidden text-slate-500 text-[10px] uppercase font-mono font-bold mr-2">State:</span>
                      <span className={`inline-flex items-center px-2 py-1 text-[9px] font-mono uppercase tracking-widest rounded border ${
                        m.status === 'ACTIVE'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.15)]'
                          : 'border-slate-700 bg-slate-800/50 text-slate-400'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-6 flex flex-col justify-between">
          <div
            onClick={() => setConsoleExpanded(true)}
            className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex items-center justify-between text-xs font-mono relative overflow-hidden cursor-pointer hover:border-emerald-500/40 transition-all duration-200 active:scale-95 shadow-[0_0_12px_rgba(52,211,153,0.02)] animate-none"
            id="event-notification-hub-link"
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
            <div className="flex items-center gap-3">
              <Terminal className="w-4 h-4 text-emerald-400 animate-pulse" />
              <div>
                <div className="font-display font-semibold text-slate-200 text-sm">Console Dock Ingestion</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Live trace pipeline actively synchronized below</div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-[9px] font-mono font-bold tracking-wider uppercase shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>DOCK_LINK</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden" id="sink-cost-card">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-orange-400" />
                <h3 className="font-display font-semibold text-slate-200 text-sm">Sink Pressure &amp; Cost Ledger</h3>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-center">
                <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">Sink Pressure</div>
                <div className="font-mono text-lg font-bold text-orange-300">{((liveStats?.sink_token_balance ?? 1000) > 500 ? 'LOW' : (liveStats?.sink_token_balance ?? 1000) > 200 ? 'MED' : 'HIGH')}</div>
                <div className="font-mono text-[9px] text-slate-500">{liveStats?.sink_token_balance ?? 1000} tokens</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
                <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">24h Cost</div>
                <div className="font-mono text-lg font-bold text-violet-300">${(liveStats?.total_24h_cost ?? 0).toFixed(2)}</div>
                <div className="font-mono text-[9px] text-slate-500">{liveStats?.total_active_models ?? 0} models active</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 relative overflow-hidden" id="circuit-breaker-health-chart">
          <div className="absolute top-0 right-0 p-3">
            <span className="flex h-2 w-2 relative">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]"></span>
            </span>
          </div>

          <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest mb-6 flex justify-between items-end">
            <span>API Gateway Rate Success vs Failure (60m)</span>
            <span className="text-rose-500/70 border border-rose-500/20 bg-rose-500/5 px-2 py-1 rounded">Circuit Breaker</span>
          </div>

          <div className="h-44 w-full mt-2">
            {circuitBreakerData.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="font-mono text-xs text-slate-500">No circuit breaker data available</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-600">API gateway metrics will appear as requests flow</div>
                </div>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={circuitBreakerData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}
                  itemStyle={{ fontFamily: 'monospace', fontSize: '11px' }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase' }}
                />
                <Line
                  type="monotone"
                  dataKey="success"
                  name="Success (200 OK)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="failure"
                  name="Failed / Blocked"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
    </PanelErrorBoundary>
  );
}

export default TelemetryPage;
