import { ThinkStormPlugin } from '../components/ThinkStormPlugin';
import { ThinkStreamPlugin } from '../components/ThinkStreamPlugin';
import { ThinkStoragePlugin } from '../components/ThinkStoragePlugin';
import { ThinkTrajectoriesPlugin } from '../components/ThinkTrajectoriesPlugin';
import { CORE_RACK_PLUGINS } from '../registry/frontend-plugins';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { SkeletonPanel } from '../components/SkeletonPanel';
import type { IKudbeePlugin, ThinkTrajectory } from '@kudbee/types';
import { useThinkTrajectories } from '../hooks/useThinkTrajectories';

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12'
};

const THINK_PLUGIN_IDS = ['plugin-storm', 'plugin-stream', 'plugin-storage', 'plugin-trajectories'];

function renderThinkPlugin(
  plugin: IKudbeePlugin,
  trajectories: ThinkTrajectory[],
  trajectoryLoading: boolean
) {
  const span = COL_SPAN_CLASS[plugin.gridSpan?.colSpan ?? 999] ?? 'lg:col-span-4';
  switch (plugin.id) {
    case 'plugin-storm':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStormPlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-stream':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStreamPlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-storage':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkStoragePlugin plugin={plugin} trajectories={trajectories} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    case 'plugin-trajectories':
      return (
        <div key={plugin.id} className={`${span} min-w-0`}>
          <PanelErrorBoundary panel={plugin.title}>
            <SkeletonPanel height="180px">
              <ThinkTrajectoriesPlugin plugin={plugin} trajectories={trajectories} loading={trajectoryLoading} />
            </SkeletonPanel>
          </PanelErrorBoundary>
        </div>
      );
    default:
      return null;
  }
}

export function ThinkPage() {
  const { trajectories, loading: trajectoryLoading } = useThinkTrajectories();
  const plugins = Object.values(CORE_RACK_PLUGINS).filter((p) => THINK_PLUGIN_IDS.includes(p.id));

  return (
    <div className="min-h-dvh" id="think-page">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
            <span className="font-mono text-sm font-bold text-violet-400">TH</span>
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">Think Station</h1>
            <p className="text-xs text-slate-500">Reasoning storm · stream · storage · trajectories</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          <span className="font-mono text-[10px] text-slate-400">{plugins.length} modules · {trajectories.length} tokens ({trajectories.filter(t => t.status === 'VERIFIED').length}✓, {trajectories.filter(t => t.status === 'PENDING_APPROVAL').length}⏳)</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12 min-w-0">
        {plugins.map((plugin) => renderThinkPlugin(plugin, trajectories, trajectoryLoading))}
      </div>
    </div>
  );
}

export default ThinkPage;
