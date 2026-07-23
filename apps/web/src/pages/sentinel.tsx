import { Radio } from 'lucide-react';
import { EdgeSentinelPlugin } from '../components/EdgeSentinelPlugin';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { SkeletonPanel } from '../components/SkeletonPanel';
import { useEdgeSignals } from '../components/RackLayout';

export function SentinelPage() {
  const { signals, connected, lastIngressAt } = useEdgeSignals();

  return (
    <div className="min-h-dvh space-y-6" id="sentinel-page">
      <header className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
          <Radio className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">Edge Sentinel Station</h1>
          <p className="text-xs text-slate-500">Telemetry egress · blast radius gauge · signal/noise monitor</p>
        </div>
      </header>

      <PanelErrorBoundary panel="EDGE: SENTINEL">
        <SkeletonPanel height="600px">
          <EdgeSentinelPlugin
            signals={signals}
            connected={connected}
            lastIngressAt={lastIngressAt}
          />
        </SkeletonPanel>
      </PanelErrorBoundary>
    </div>
  );
}

export default SentinelPage;
