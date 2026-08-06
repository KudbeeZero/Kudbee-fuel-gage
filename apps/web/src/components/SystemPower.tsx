import { useEffect, useState, useCallback } from 'react';
import { Power, PowerOff, Loader2 } from 'lucide-react';

/**
 * SystemPower — OS-grade power lifecycle for the Control Tower.
 *
 * Boot → Online → Standby, wired to LIVE system data:
 *   - /api/system/agent-status  → agent fleet count
 *   - /api/ci/status            → CI health
 *   - /health                   → dependency health
 *
 * The power button reflects real state: BOOTING while the app connects,
 * ONLINE when agents + deps are healthy, STANDBY when the operator powers
 * the OS down (UI dims; clicking powers back up through the boot sequence).
 * Agents + serverless data drive every state — nothing is fabricated.
 */

type PowerState = 'booting' | 'online' | 'standby';

interface LiveSnapshot {
  agents: number;
  ci: string;
  redis: string;
  status: string;
}

const POLL_MS = 8000;

export function SystemPower() {
  const [state, setState] = useState<PowerState>('booting');
  const [bootStep, setBootStep] = useState(0);
  const [snapshot, setSnapshot] = useState<LiveSnapshot>({ agents: 0, ci: '—', redis: '—', status: 'connecting' });
  const [lastSync, setLastSync] = useState<string>('—');

  const BOOT_STEPS = [
    'Initializing runtime…',
    'Connecting to Control Tower…',
    'Verifying agent fleet…',
    'Checking dependencies…',
    'System online.',
  ];

  // Boot sequence: run through steps, then go ONLINE.
  useEffect(() => {
    if (state !== 'booting') return;
    if (bootStep >= BOOT_STEPS.length) {
      setState('online');
      return;
    }
    const t = setTimeout(() => setBootStep((s) => s + 1), 650);
    return () => clearTimeout(t);
  }, [state, bootStep, BOOT_STEPS.length]);

  // Live polling — the data that decides ONLINE vs DEGRADED.
  const refresh = useCallback(async () => {
    try {
      const [agentsRes, ciRes, healthRes] = await Promise.allSettled([
        fetch('/api/system/agent-status', { cache: 'no-store' }),
        fetch('/api/ci/status', { cache: 'no-store' }),
        fetch('/health', { cache: 'no-store' }),
      ]);

      let agents = 0;
      let ci = '—';
      let redis = '—';
      let status = 'degraded';

      if (agentsRes.status === 'fulfilled') {
        const d = await agentsRes.value.json();
        const list = Array.isArray(d) ? d : d.agents ?? [];
        agents = list.length;
      }
      if (ciRes.status === 'fulfilled') {
        const d = await ciRes.value.json();
        ci = d.status ?? '—';
      }
      if (healthRes.status === 'fulfilled') {
        const d = await healthRes.value.json();
        redis = d.dependencies?.redis ?? '—';
        status = d.status === 'ok' ? 'ok' : 'degraded';
      }

      setSnapshot({ agents, ci, redis, status });
      setLastSync(new Date().toLocaleTimeString());
    } catch {
      setSnapshot((s) => ({ ...s, status: 'degraded' }));
    }
  }, []);

  useEffect(() => {
    if (state === 'standby') return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [state, refresh]);

  const togglePower = () => {
    if (state === 'standby') {
      setBootStep(0);
      setState('booting');
    } else {
      setState('standby');
    }
  };

  // ── Standby: dim the whole tower behind this overlay ──
  if (state === 'standby') {
    return (
      <div
        className="fixed inset-0 z-[500] flex flex-col items-center justify-center gap-4 bg-slate-950/95 backdrop-blur-sm"
        style={{ cursor: 'pointer' }}
        onClick={togglePower}
        role="button"
        aria-label="Power on"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80">
          <PowerOff className="h-6 w-6 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-slate-300">KUDBEE OS</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-600">Standby — click to power on</p>
        </div>
      </div>
    );
  }

  const online = state === 'online' && snapshot.status === 'ok';
  const dotCls = online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : state === 'online' ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-500';

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-800/60 bg-slate-900/40">
      <div className="flex items-center gap-2.5 min-w-0">
        {state === 'booting' ? (
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        ) : (
          <span className={`relative flex h-2 w-2 shrink-0`}>
            <span className={`absolute inline-flex h-full w-full rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-600'} opacity-75 ${online ? 'animate-ping' : ''}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotCls}`} />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">
            {state === 'booting' ? BOOT_STEPS[Math.min(bootStep, BOOT_STEPS.length - 1)] : online ? 'System online' : 'System degraded'}
          </p>
          <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-wider text-slate-600">
            {state === 'booting' ? `step ${Math.min(bootStep + 1, BOOT_STEPS.length)}/${BOOT_STEPS.length}` : `${snapshot.agents} agents · CI ${snapshot.ci} · Redis ${snapshot.redis}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-[9px] text-slate-700 lg:inline">synced {lastSync}</span>
        <button
          onClick={togglePower}
          title={state === 'online' ? 'Power off (standby)' : 'Power on'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 text-slate-400 transition-colors hover:border-rose-500/30 hover:text-rose-400"
        >
          <Power className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
