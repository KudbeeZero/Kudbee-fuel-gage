import { Shield, ShieldAlert, ShieldOff, Activity } from 'lucide-react';
import { useFocusTrap } from '../../lib/focusTrap';
import type { MiddlewareGuardStatus } from '../../hooks/useMiddlewareStatus';

const GUARD_DESCRIPTIONS: Record<string, string> = {
  'rate-limiter': 'Global sliding-window rate limiter with atomic Redis EVAL',
  'timeout': '15s request timeout guard against Heroku H27',
  'bearer-auth': 'Bearer token + Agent Pass authentication',
  'zod-validator': 'Zod schema request body/query validation',
  'ecp-singleflight': 'Concurrent GET request deduplication cache',
  'kilo-bridge': 'Per-tenant token budget enforcement gate',
  'spheroid-audit': 'All mutating requests audited to Redis stream',
  'global-error-handler': 'Structured JSON error with trace IDs + breadcrumbs',
};

function statusIcon(state: string) {
  switch (state) {
    case 'ACTIVE':
      return <Shield className="w-5 h-5 text-emerald-400" />;
    case 'DEGRADED':
      return <ShieldAlert className="w-5 h-5 text-amber-400" />;
    case 'BYPASSED':
      return <ShieldOff className="w-5 h-5 text-red-400" />;
    default:
      return <Activity className="w-5 h-5 text-zinc-400" />;
  }
}

function statusColor(state: string) {
  switch (state) {
    case 'ACTIVE': return 'border-emerald-500/30 bg-emerald-500/5';
    case 'DEGRADED': return 'border-amber-500/30 bg-amber-500/5';
    case 'BYPASSED': return 'border-red-500/30 bg-red-500/5';
    default: return 'border-zinc-700/30 bg-zinc-800/30';
  }
}

interface Props {
  guards: MiddlewareGuardStatus[];
}

export function MiddlewareInspector({ guards }: Props) {
  const trapRef = useFocusTrap(guards.length > 0);

  if (guards.length === 0) {
    return (
      <div className="text-zinc-500 text-sm p-4">No middleware guards registered. Start the server to see live status.</div>
    );
  }

  return (
    <div ref={trapRef} className="space-y-3" role="region" aria-label="Middleware Status Grid">
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Middleware Guards</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {guards.map((guard) => (
          <div
            key={guard.name}
            className={`rounded-xl border p-4 transition-colors ${statusColor(guard.state)}`}
            role="status"
            aria-label={`${guard.name}: ${guard.state}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {statusIcon(guard.state)}
              <span className="text-sm font-medium text-zinc-200 capitalize">
                {guard.name.replace(/-/g, ' ')}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mb-1">
              {GUARD_DESCRIPTIONS[guard.name] ?? 'Middleware guard'}
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs font-mono">
              <span className="text-emerald-400">{guard.successes.toLocaleString()} ✓</span>
              <span className="text-red-400">{guard.failures.toLocaleString()} ✗</span>
              {guard.bypassed > 0 && (
                <span className="text-amber-400">{guard.bypassed.toLocaleString()} ↷</span>
              )}
            </div>
            {guard.state !== 'ACTIVE' && guard.lastFailure && (
              <div className="mt-2 text-xs text-amber-500 truncate" title={guard.lastFailure}>
                Last failure: {new Date(guard.lastFailure).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
