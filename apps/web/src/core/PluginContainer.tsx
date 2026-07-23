import { Suspense, type ComponentType } from 'react';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { SkeletonPanel } from '../components/SkeletonPanel';

interface Props {
  component: ComponentType<Record<string, unknown>>;
  panelName: string;
  height?: string;
  props?: Record<string, unknown>;
}

export function PluginContainer({ component: Comp, panelName, height, props }: Props) {
  return (
    <PanelErrorBoundary panel={panelName}>
      <Suspense fallback={<SkeletonPanel height={height || '200px'} />}>
        <Comp {...props} />
      </Suspense>
    </PanelErrorBoundary>
  );
}
