import { RackLayout } from './RackLayout';
import { PanelErrorBoundary } from './PanelErrorBoundary';

export function AgenticRack() {
  return (
    <div className="mt-5" id="agentic-rack">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Agentic Rack · Motherboard
        </span>
        <span className="font-mono text-[9px] text-slate-600">
          12-col · hot-swappable
        </span>
      </div>
      <PanelErrorBoundary panel="RackLayout">
        <RackLayout />
      </PanelErrorBoundary>
    </div>
  );
}

export default AgenticRack;
