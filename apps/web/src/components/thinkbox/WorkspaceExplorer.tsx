import { FolderTree, Package, Database, Zap, Layers, Globe } from 'lucide-react';
import { useDashboardSync } from '../../hooks/useDashboardSync';

export function WorkspaceExplorer() {
  const { viewModel } = useDashboardSync();
  const intel = viewModel.intelligence;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <FolderTree className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-semibold text-zinc-100 font-mono">Explorer</h3>
      </div>

      {/* Languages */}
      {intel.languages.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Globe className="w-2.5 h-2.5" /> Languages
          </div>
          {intel.languages.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-3">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-zinc-300">{l}</span>
            </div>
          ))}
        </div>
      )}

      {/* Frameworks */}
      {intel.frameworks.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Layers className="w-2.5 h-2.5" /> Frameworks
          </div>
          {intel.frameworks.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-3">
              <span className="w-1 h-1 rounded-full bg-violet-400" />
              <span className="text-zinc-300">{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Packages */}
      {intel.packageManagers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Package className="w-2.5 h-2.5" /> Package Managers
          </div>
          {intel.packageManagers.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-3">
              <span className="w-1 h-1 rounded-full bg-blue-400" />
              <span className="text-zinc-300">{m}</span>
            </div>
          ))}
          {intel.dependencies.map((dep, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-5">
              <span className="text-zinc-400">{dep.manager}</span>
              <span className="text-slate-600">{dep.totalCount} pkg</span>
              {dep.lockfilePresent && <span className="text-emerald-600 text-[8px]">locked</span>}
            </div>
          ))}
        </div>
      )}

      {/* Services */}
      {intel.services.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Database className="w-2.5 h-2.5" /> Services
          </div>
          {intel.services.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono pl-3">
              <span className={`w-1 h-1 rounded-full ${
                s.kind === 'database' ? 'bg-violet-400' :
                s.kind === 'cache' ? 'bg-amber-400' :
                s.kind === 'ai' ? 'bg-rose-400' : 'bg-slate-400'
              }`} />
              <span className="text-zinc-300">{s.name}</span>
              {s.sdk && <span className="text-slate-600">{s.sdk}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Runtimes */}
      {intel.runtimes.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
            <Zap className="w-2.5 h-2.5" /> Runtimes
          </div>
          {intel.runtimes.map((rt, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] font-mono pl-3">
              <span className="text-zinc-300">{rt.kind}</span>
              {rt.version && <span className="text-slate-500">{rt.version}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Deploy Targets */}
      {intel.deploy.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">Deploy</div>
          <div className="flex flex-wrap gap-1 pl-3">
            {intel.deploy.map((d, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0 rounded bg-emerald-500/10 text-emerald-400 font-mono">{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* CI Systems */}
      {intel.ci.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">CI</div>
          <div className="flex flex-wrap gap-1 pl-3">
            {intel.ci.map((c, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0 rounded bg-blue-500/10 text-blue-400 font-mono">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceExplorer;
