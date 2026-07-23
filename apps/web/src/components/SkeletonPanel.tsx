import { Suspense, type ReactNode } from 'react';

interface SkeletonPanelProps { children: ReactNode; height?: string; }

function Skeleton({ height = '200px' }: { height?: string }) {
  return (
    <div className="animate-pulse rounded-lg border border-slate-800 bg-slate-900/60 p-4" style={{ minHeight: height }}>
      <div className="h-3 w-1/3 rounded bg-slate-800 mb-3" />
      <div className="h-3 w-2/3 rounded bg-slate-800 mb-2" />
      <div className="h-3 w-1/2 rounded bg-slate-800" />
    </div>
  );
}

export function SkeletonPanel({ children, height }: SkeletonPanelProps) {
  return (
    <Suspense fallback={<Skeleton height={height} />}>
      {children}
    </Suspense>
  );
}

export default SkeletonPanel;
