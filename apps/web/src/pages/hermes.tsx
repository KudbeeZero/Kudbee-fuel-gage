import { TerminalSquare } from 'lucide-react';
import { HermesAuditorPlugin } from '../components/HermesAuditorPlugin';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { SkeletonPanel } from '../components/SkeletonPanel';
import { useHermesAuditLogs } from '../components/RackLayout';
import { CORE_RACK_PLUGINS } from '../registry/frontend-plugins';

export function HermesPage() {
  const hermesPlugin = CORE_RACK_PLUGINS['plugin-hermes-auditor'];
  const { logs, connected } = useHermesAuditLogs();

  return (
    <div className="min-h-dvh space-y-6" id="hermes-page">
      <header className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <TerminalSquare className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">HERMES Auditor Station</h1>
          <p className="text-xs text-slate-500">Live audit sweep · probe · filter by trace_id / agent</p>
        </div>
      </header>

      {hermesPlugin && (
        <PanelErrorBoundary panel={hermesPlugin.title}>
          <SkeletonPanel height="600px">
            <HermesAuditorPlugin plugin={hermesPlugin} logs={logs} connected={connected} />
          </SkeletonPanel>
        </PanelErrorBoundary>
      )}

      {!hermesPlugin && (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-600">
          <TerminalSquare className="h-8 w-8 opacity-40" />
          <span className="font-mono text-xs">HERMES Auditor plugin not registered.</span>
        </div>
      )}
    </div>
  );
}

export default HermesPage;
