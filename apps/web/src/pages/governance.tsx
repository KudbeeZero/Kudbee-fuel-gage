import { lazy, Suspense } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { GovernanceGatePlugin } from '../components/GovernanceGatePlugin';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { SkeletonPanel } from '../components/SkeletonPanel';
import { CORE_RACK_PLUGINS } from '../registry/frontend-plugins';

const GovernanceView = lazy(() => import('../components/GovernanceView').then((m) => ({ default: m.GovernanceView })));

function RouteFallback({ label }: { label: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500">
      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mb-3" />
      <span className="font-mono text-[10px] uppercase tracking-widest">{label}…</span>
    </div>
  );
}

export function GovernancePage() {
  const govGatePlugin = CORE_RACK_PLUGINS['plugin-gov-gate'];

  return (
    <div className="min-h-dvh space-y-6" id="governance-page">
      <header className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <Shield className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">Governance Station</h1>
          <p className="text-xs text-slate-500">HITL approval gate · policy engine</p>
        </div>
      </header>

      {govGatePlugin && (
        <PanelErrorBoundary panel={govGatePlugin.title}>
          <SkeletonPanel height="200px">
            <GovernanceGatePlugin plugin={govGatePlugin} />
          </SkeletonPanel>
        </PanelErrorBoundary>
      )}

      <Suspense fallback={<RouteFallback label="Loading Governance View" />}>
        <GovernanceView />
      </Suspense>
    </div>
  );
}

export default GovernancePage;
