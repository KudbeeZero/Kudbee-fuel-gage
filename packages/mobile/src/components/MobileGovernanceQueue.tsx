import React, { useState, useCallback, useRef } from 'react';
import { useMobileTelemetryStore } from '../store/useMobileTelemetryStore';
import type { MobileGovernanceItem } from '../store/useMobileTelemetryStore';

function RiskBadge({ level }: { level: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const styles: Record<string, string> = {
    LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    HIGH: 'border-rose-500/30 bg-rose-500/10 text-rose-400'
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[8px] font-bold uppercase ${styles[level]}`}>
      {level}
    </span>
  );
}

function GovernanceItem({
  item,
  onApprove,
  onReject
}: {
  item: MobileGovernanceItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [swipeState, setSwipeState] = useState<'idle' | 'swiping' | 'revealed'>('idle');
  const startX = useRef(0);
  const [translateX, setTranslateX] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setSwipeState('swiping');
    startX.current = e.touches[0]!.clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeState !== 'swiping') return;
    const delta = e.touches[0]!.clientX - startX.current;
    setTranslateX(Math.max(-120, Math.min(120, delta)));
  }, [swipeState]);

  const handleTouchEnd = useCallback(() => {
    if (translateX < -80) {
      onReject(item.id);
    } else if (translateX > 80) {
      onApprove(item.id);
    }
    setSwipeState('idle');
    setTranslateX(0);
  }, [translateX, item.id, onApprove, onReject]);

  if (item.status !== 'PENDING') return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <div
        className="p-3 transition-transform duration-200"
        style={{
          transform: `translateX(${translateX}px)`,
          touchAction: 'pan-y',
          minHeight: 44
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-slate-300 truncate">{item.action}</span>
          <RiskBadge level={item.riskLevel} />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-slate-500">{item.agentId}</span>
          <span className="font-mono text-[8px] text-slate-600">
            {new Date(item.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onApprove(item.id)}
            className="flex-1 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono font-semibold text-emerald-300 active:bg-emerald-500/20"
            style={{ minHeight: 44 }}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onReject(item.id)}
            className="flex-1 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[10px] font-mono font-semibold text-rose-300 active:bg-rose-500/20"
            style={{ minHeight: 44 }}
          >
            Reject
          </button>
        </div>
      </div>

      <div className="absolute inset-y-0 left-0 flex items-center px-4 bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase pointer-events-none"
        style={{ transform: `translateX(${Math.min(0, translateX) + 10}px)` }}>
        APPROVE
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center px-4 bg-rose-500/20 text-rose-400 text-[10px] font-mono font-bold uppercase pointer-events-none"
        style={{ transform: `translateX(${Math.max(0, translateX) - 10}px)` }}>
        REJECT
      </div>
    </div>
  );
}

export function MobileGovernanceQueue() {
  const governanceItems = useMobileTelemetryStore((s) => s.governanceItems);
  const updateGovernanceStatus = useMobileTelemetryStore((s) => s.updateGovernanceStatus);

  const handleApprove = useCallback(
    (id: string) => updateGovernanceStatus(id, 'APPROVED'),
    [updateGovernanceStatus]
  );

  const handleReject = useCallback(
    (id: string) => updateGovernanceStatus(id, 'REJECTED'),
    [updateGovernanceStatus]
  );

  const pending = governanceItems.filter((g) => g.status === 'PENDING');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
          Governance Queue
        </span>
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[9px] text-amber-400">
          {pending.length} pending
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-600">
          <span className="text-[10px] uppercase tracking-widest">No pending approvals</span>
        </div>
      ) : (
        pending.map((item) => (
          <GovernanceItem
            key={item.id}
            item={item}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))
      )}
    </div>
  );
}
