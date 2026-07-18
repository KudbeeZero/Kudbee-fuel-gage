import React, { memo } from 'react';
import { Network, Server, Activity } from 'lucide-react';
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
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
      
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">Live Traffic Topology</h3>
          <button
            onClick={onTestRoute}
            className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold tracking-wider rounded-lg hover:bg-blue-500/20 transition-colors"
          >
            TEST GATEWAY ROUTE
          </button>
        </div>
        
        <div className="relative h-64 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-center p-8 overflow-hidden">
          {/* SVG Lines for animation */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <line 
              x1="20%" y1="50%" 
              x2="80%" y2="25%" 
              stroke={activeRoute === 'PRIMARY' ? '#3b82f6' : activeRoute === 'FAILOVER' ? '#ef4444' : '#1e293b'} 
              strokeWidth="2"
              strokeDasharray="4 4"
              className={activeRoute === 'PRIMARY' ? 'animate-[dash_1s_linear_infinite]' : ''}
            />
            <line 
              x1="20%" y1="50%" 
              x2="80%" y2="75%" 
              stroke={activeRoute === 'FAILOVER' ? '#10b981' : '#1e293b'} 
              strokeWidth="2"
              strokeDasharray="4 4"
              className={activeRoute === 'FAILOVER' ? 'animate-[dash_1s_linear_infinite]' : ''}
            />
          </svg>
          
          {/* Edge Gateway Node */}
          <div className="absolute left-10 lg:left-24 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${activeRoute !== 'IDLE' ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-slate-700'}`}>
              <Network className={`w-8 h-8 ${activeRoute !== 'IDLE' ? 'text-blue-400' : 'text-slate-500'}`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-3 font-semibold text-center tracking-widest">CENTRAL<br/>GATEWAY EDGE</span>
          </div>

          {/* Primary Region Node */}
          <div className="absolute right-10 lg:right-32 top-8 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
              activeRoute === 'PRIMARY' ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 
              activeRoute === 'FAILOVER' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 
              'border-slate-700'
            }`}>
              <Server className={`w-6 h-6 ${
                activeRoute === 'PRIMARY' ? 'text-blue-400' : 
                activeRoute === 'FAILOVER' ? 'text-red-500' : 
                'text-slate-500'
              }`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest">us-east-1</span>
            <span className="text-[9px] text-slate-500">Claude 3.5 Sonnet</span>
          </div>

          {/* Failover Region Node */}
          <div className="absolute right-10 lg:right-32 bottom-8 flex flex-col items-center z-10">
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center bg-slate-900 transition-colors duration-300 ${
              activeRoute === 'FAILOVER' ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 
              'border-slate-700'
            }`}>
              <Activity className={`w-6 h-6 ${
                activeRoute === 'FAILOVER' ? 'text-emerald-400' : 
                'text-slate-500'
              }`} />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mt-2 font-semibold tracking-widest">eu-central-1</span>
            <span className="text-[9px] text-slate-500">DeepSeek-R1</span>
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
