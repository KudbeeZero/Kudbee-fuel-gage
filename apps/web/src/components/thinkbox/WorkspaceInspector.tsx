import { Search, Key, Globe, Shield, GitBranch, Clock, Database, HardDrive } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function WorkspaceInspector() {
  const { viewModel } = useDashboardSync();
  const intel = viewModel.intelligence;
  const costs = viewModel.costs;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-zinc-100 font-mono">Inspector</h3>
      </div>

      {/* Environment Variables */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
          <Key className="w-3 h-3" /> Environment
        </div>
        {intel.env.length === 0 ? (
          <div className="text-[10px] text-slate-600 font-mono pl-5">No env vars detected</div>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {intel.env.slice(0, 15).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] font-mono pl-5">
                <span className="text-zinc-300 truncate">{e.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[8px] px-1 rounded ${
                    e.category === 'database' ? 'bg-violet-500/10 text-violet-400' :
                    e.category === 'cache' ? 'bg-amber-500/10 text-amber-400' :
                    e.category === 'ai' ? 'bg-rose-500/10 text-rose-400' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>{e.category}</span>
                  {e.required && <span className="text-amber-500 text-[8px]">REQ</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deployments */}
      {viewModel.deployments.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Globe className="w-3 h-3" /> Deployments
          </div>
          {viewModel.deployments.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] font-mono pl-5">
              <span className="text-zinc-300">{d.target}</span>
              <span className={`text-[9px] ${
                d.status === 'healthy' ? 'text-emerald-400' :
                d.status === 'degraded' ? 'text-amber-400' : 'text-slate-500'
              }`}>{d.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Costs */}
      {costs.breakdown.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Database className="w-3 h-3" /> Costs
          </div>
          <div className="text-lg font-bold text-zinc-200 font-mono pl-5">
            ${costs.estimatedMonthly}/mo
          </div>
          {costs.breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] font-mono pl-5">
              <span className="text-zinc-300">{b.category}</span>
              <span className="text-slate-400">${b.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* File count summary */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
          <HardDrive className="w-3 h-3" /> Summary
        </div>
        <div className="grid grid-cols-2 gap-1 pl-5 text-[10px] font-mono">
          <span className="text-slate-500">Languages</span>
          <span className="text-zinc-300 text-right">{intel.languages.length}</span>
          <span className="text-slate-500">Frameworks</span>
          <span className="text-zinc-300 text-right">{intel.frameworks.length}</span>
          <span className="text-slate-500">Packages</span>
          <span className="text-zinc-300 text-right">{intel.packageCount}</span>
          <span className="text-slate-500">Files</span>
          <span className="text-zinc-300 text-right">{intel.totalFiles}</span>
          <span className="text-slate-500">Services</span>
          <span className="text-zinc-300 text-right">{intel.services.length}</span>
          <span className="text-slate-500">Confidence</span>
          <span className="text-emerald-400 text-right">{Math.round(intel.confidence * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceInspector;
