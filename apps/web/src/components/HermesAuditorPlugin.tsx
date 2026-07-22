import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { TerminalSquare } from 'lucide-react';
import type { IKudbeePlugin } from '@kudbee/types';

export const HermesAuditLogSchema = z.object({
  ts: z.string().min(1),
  line: z.string().min(1)
});
export type HermesAuditLog = z.infer<typeof HermesAuditLogSchema>;

export interface HermesAuditorPluginProps {
  /** The plugin descriptor from the frontend registry (title, status, span). */
  plugin: IKudbeePlugin;
  /** Pre-fetched audit lines (already validated upstream). */
  logs?: readonly HermesAuditLog[];
  /** Whether the worker SSE/event bus is connected. */
  connected?: boolean;
}

interface ParsedSweep {
  ts: string;
  level: 'AUDIT' | 'WARN' | 'ERROR' | 'INFO' | 'UNKNOWN';
  target: string;
}

const LEVEL_ORDER = ['AUDIT', 'WARN', 'ERROR', 'INFO'] as const;

// Extract a stable level + target from a raw [HERMES:AUDITOR] log line.
// Example: "2026-07-20T00:15:32.123Z [HERMES:AUDITOR] AUDIT audit pass started"
function parseSweep(raw: HermesAuditLog): ParsedSweep | null {
  if (!raw?.line) return null;
  const levelMatch = raw.line.match(/\[(HERMES:AUDITOR)\]\s*(AUDIT|WARN|ERROR|INFO)/i);
  const level = (levelMatch?.[2]?.toUpperCase() as ParsedSweep['level']) || 'UNKNOWN';
  // Target: the first meaningful token after the level (e.g. "audit", "memory",
  // "logic", "think", "system topology").
  const tail = raw.line.slice((levelMatch?.index ?? 0) + (levelMatch?.[0]?.length ?? 0));
  const targetMatch = tail.match(/[a-z_]+/i);
  const target = targetMatch?.[0] ?? 'audit';
  return { ts: raw.ts, level, target };
}

function levelTone(level: ParsedSweep['level']): string {
  switch (level) {
    case 'AUDIT':
      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'WARN':
      return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    case 'ERROR':
      return 'text-rose-300 border-rose-500/30 bg-rose-500/10';
    case 'INFO':
      return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
    default:
      return 'text-slate-300 border-slate-700 bg-slate-800/40';
  }
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function HermesAuditorPlugin({
  plugin,
  logs = [],
  connected = true
}: HermesAuditorPluginProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sweeps = logs
    .map(parseSweep)
    .filter((s): s is ParsedSweep => s !== null)
    .slice(0, 40);

  // Keep the newest sweep in view (terminal-style auto-scroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sweeps.length]);

  const lastSweep = sweeps[0];
  const levelCounts = LEVEL_ORDER.reduce<Record<string, number>>((acc, l) => {
    acc[l] = sweeps.filter((s) => s.level === l).length;
    return acc;
  }, {});

  return (
    <article
      id="plugin-hermes-auditor"
      data-plugin="auditor"
      className="group relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-0 transition-all hover:border-emerald-500/40"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <header className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-200">
            {plugin.title}
          </h3>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-500'}`}
          />
          {connected ? 'WORKER LINKED' : 'OFFLINE'}
        </span>
      </header>

      {/* Real-time audit sweep stream */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-1 overflow-y-auto px-5 py-3 font-mono text-[11px] leading-relaxed"
      >
        {sweeps.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-slate-600">
            <TerminalSquare className="h-7 w-7 opacity-40" />
            <span className="font-mono text-xs">No audit sweeps captured. Worker idle or not linked.</span>
          </div>
        ) : (
          sweeps.map((sweep, i) => (
            <div key={`${sweep.ts}-${i}`} className="flex items-center gap-2">
              <span className="shrink-0 text-slate-600">{formatTs(sweep.ts)}</span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${levelTone(sweep.level)}`}
              >
                {sweep.level}
              </span>
              <span className="truncate text-slate-400">
                audit sweep · <span className="text-slate-200">{sweep.target}</span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer: live level tally + last target */}
      <footer className="flex items-center justify-between border-t border-slate-800/60 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span>
          audit {levelCounts.AUDIT} · warn {levelCounts.WARN} · err {levelCounts.ERROR}
        </span>
        <span>
          {lastSweep ? `last: ${lastSweep.level.toLowerCase()} · ${lastSweep.target}` : 'no sweeps'}
        </span>
      </footer>
    </article>
  );
}

export { parseSweep };
export default HermesAuditorPlugin;
