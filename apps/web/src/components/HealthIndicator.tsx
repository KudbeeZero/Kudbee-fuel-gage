interface Props { status: 'healthy' | 'degraded' | 'offline'; label?: string; }

export function HealthIndicator({ status, label }: Props) {
  const colors = { healthy: 'bg-emerald-400', degraded: 'bg-amber-400', offline: 'bg-rose-500' };
  const labels = { healthy: label || 'Live', degraded: 'Local Fallback', offline: 'Offline' };
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] text-slate-400">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}
