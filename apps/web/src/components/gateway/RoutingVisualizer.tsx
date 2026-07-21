import React, { memo } from 'react';
import { Network, Server, Activity, Wifi, WifiOff, AlertTriangle, Database, ArrowRight } from 'lucide-react';
import { GatewayLog } from '../../hooks/useRoutingRules';

interface RoutingVisualizerProps {
  activeRoute: 'IDLE' | 'PRIMARY' | 'FAILOVER';
  gatewayLogs: GatewayLog[];
  onTestRoute: () => void;
}

export const RoutingVisualizer = memo(function RoutingVisualizer({
  activeRoute,
  gatewayLogs,
  onTestRoute
}: RoutingVisualizerProps) {
  const primaryActive = activeRoute === 'PRIMARY';
  const failoverActive = activeRoute === 'FAILOVER';
  const offline = activeRoute === 'IDLE';

  // Status chip helper
  const StatusChip = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
      }`}
    >
      {ok ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {label}
    </span>
  );

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

      <div className="p-8">
        {/* Status header row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="space-y-2">
            <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">Live Traffic Topology</h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip ok={primaryActive} label={`Primary · us-east-1 ${primaryActive ? '· ACTIVE' : offline ? '· OFFLINE' : ''}`} />
              <StatusChip ok={failoverActive} label={`Failover · eu-central-1 ${failoverActive ? '· ACTIVE' : offline ? '· OFFLINE' : ''}`} />
              {offline && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[10px] font-bold uppercase tracking-widest">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Idle · Awaiting Requests
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onTestRoute}
            className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold tracking-wider rounded-lg hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer"
          >
            TEST GATEWAY ROUTE
          </button>
        </div>

        <div className="relative h-72 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-center p-8 overflow-hidden">
          {/* SVG Lines for animation */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <line
              x1="20%" y1="50%"
              x2="80%" y2="25%"
              stroke={primaryActive ? '#3b82f6' : failoverActive ? '#ef4444' : '#1e293b'}
              strokeWidth="2"
              strokeDasharray="4 4"
              className={primaryActive ? 'animate-[dash_1s_linear_infinite]' : ''}
            />
            <line
              x1="20%" y1="50%"
              x2="80%" y2="75%"
              stroke={failoverActive ? '#10b981' : '#1e293b'}
              strokeWidth="2"
              strokeDasharray="4 4"
              className={failoverActive ? 'animate-[dash_1s_linear_infinite]' : ''}
            />
          </svg>

          {/* Incoming Requests source (left) */}
          <div className="absolute left-10 lg:left-20 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${!offline ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-slate-700'}`}>
              <Network className={`w-8 h-8 ${!offline ? 'text-blue-400' : 'text-slate-500'}`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-3 font-semibold text-center tracking-widest">INCOMING<br />REQUESTS</span>
          </div>

          {/* Outgoing → LLM Layer (top right) */}
          <div className="absolute right-10 lg:right-28 top-6 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
              primaryActive ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' :
              failoverActive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' :
              'border-slate-700'
            }`}>
              <Server className={`w-6 h-6 ${
                primaryActive ? 'text-blue-400' :
                failoverActive ? 'text-red-500' :
                'text-slate-500'
              }`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest flex items-center gap-1">
              <ArrowRight className={`w-3 h-3 ${primaryActive ? 'text-blue-400' : 'text-slate-600'}`} />
              LLM LAYER
            </span>
              <span className="text-[9px] text-slate-500">us-east-1 · Primary Route</span>
          </div>

          {/* Outgoing → Redis/Memory Layer (bottom right) */}
          <div className="absolute right-10 lg:right-28 bottom-6 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
              failoverActive ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' :
              offline ? 'border-slate-700' : 'border-slate-700'
            }`}>
              <Database className={`w-6 h-6 ${
                failoverActive ? 'text-emerald-400' :
                'text-slate-500'
              }`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest flex items-center gap-1">
              <ArrowRight className={`w-3 h-3 ${failoverActive ? 'text-emerald-400' : 'text-slate-600'}`} />
              REDIS LAYER
            </span>
              <span className="text-[9px] text-slate-500">eu-central-1 · Failover Route</span>
          </div>
        </div>

        <div className="mt-6 bg-black rounded-lg border border-slate-800 p-4 h-48 overflow-y-auto">
          <h4 className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mb-3 border-b border-slate-800 pb-2">CRIS Edge Gateway Logs</h4>
          <div className="space-y-1.5">
            {gatewayLogs.map(log => (
              <div key={log.id} className="font-mono text-xs flex items-start gap-3">
                <span className="text-slate-600 whitespace-nowrap">
                  [{log.timestamp.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}]
                </span>
                <span className={`font-semibold whitespace-nowrap ${
                  log.level === 'INFO' ? 'text-blue-400' :
                  log.level === 'WARN' ? 'text-amber-400' :
                  log.level === 'ERROR' ? 'text-red-400' :
                  'text-emerald-400'
                }`}>
                  [{log.level}]
                </span>
                <span className="text-slate-300">
                  {log.message}
                </span>
              </div>
            ))}
            {gatewayLogs.length === 0 && (
              <div className="text-slate-600 text-xs font-mono italic">Waiting for inbound API requests...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
