interface Props {
  status: 'healthy' | 'degraded' | 'offline' | 'loading';
  label?: string;
}

const STATUS_META = {
  healthy: { color: 'bg-emerald-400', label: 'Live', aria: 'System healthy — live connection' },
  degraded: { color: 'bg-amber-400', label: 'Local Fallback', aria: 'System degraded — local fallback mode' },
  offline: { color: 'bg-rose-500', label: 'Offline', aria: 'System offline — no connectivity' },
  loading: { color: 'bg-slate-500 animate-pulse', label: 'Checking', aria: 'Health check in progress' }
} as const;

export function HealthIndicator({ status, label }: Props) {
  const meta = STATUS_META[status];
  const displayLabel = label || meta.label;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9px] text-slate-400"
      role="status"
      aria-label={meta.aria}
    >
      <span className={`h-2 w-2 rounded-full ${meta.color}`} />
      {displayLabel}
    </span>
  );
}