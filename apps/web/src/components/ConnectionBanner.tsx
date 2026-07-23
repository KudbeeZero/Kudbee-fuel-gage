import { useOsSnapshot } from './OsStreamProvider';
import { WifiOff, AlertTriangle } from 'lucide-react';

export function ConnectionBanner() {
  const { snapshot: os, connected } = useOsSnapshot();

  if (connected && os.services.postgres.ok && os.services.redis.ok) return null;

  if (!connected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-mono text-rose-300" role="alert" aria-live="assertive">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>OS Stream disconnected — reconnecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-mono text-amber-300" role="alert" aria-live="polite">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Connection Degraded
        {!os.services.postgres.ok && ' — Postgres offline'}
        {!os.services.redis.ok && ' — Redis offline'}
      </span>
    </div>
  );
}
