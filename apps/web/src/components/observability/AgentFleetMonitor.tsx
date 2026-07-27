import { Bot, Clock, Zap, Layers, DoorOpen, Activity } from 'lucide-react';
import type { FleetAgent, TopSnippet, AgentStatusResponse } from '../../hooks/useAgentStatus';

function statusDot(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]';
    case 'idle': return 'bg-zinc-500';
    case 'waiting': return 'bg-amber-400 animate-pulse';
    default: return 'bg-zinc-600';
  }
}

interface Props {
  data: AgentStatusResponse | null;
  loading: boolean;
  error: string | null;
}

export function AgentFleetMonitor({ data, loading, error }: Props) {
  if (loading && !data) {
    return <div className="text-zinc-500 text-sm p-4">Loading agent fleet...</div>;
  }

  if (error) {
    return <div className="text-amber-400 text-sm p-4">Agent bridge offline: {error}</div>;
  }

  if (!data) return null;

  const { agents, snippets, decisions, memories, knowledgeGraph, rateLimits, waitQueue, journal } = data;

  return (
    <div className="space-y-4" role="region" aria-label="Agent Fleet Status">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Agent Fleet</h3>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
          <span>Sessions: {journal.sessions}</span>
          <span>Actions: {memories.totalActions}</span>
        </div>
      </div>

      {/* ── Rate Limit + Wait Queue ────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">Rate Limits</span>
          </div>
          <div className="text-lg font-mono font-bold text-zinc-200">
            {rateLimits.global.currentRunning}/{rateLimits.global.maxConcurrent}
          </div>
          <div className="text-[10px] text-zinc-500">concurrent agents</div>
        </div>

        <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <DoorOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">Wait Queue</span>
          </div>
          <div className="text-lg font-mono font-bold text-zinc-200">
            {waitQueue.queued.length}
          </div>
          <div className="text-[10px] text-zinc-500">queued · {waitQueue.processed} processed</div>
        </div>

        <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">Knowledge</span>
          </div>
          <div className="text-lg font-mono font-bold text-zinc-200">
            {(snippets.totalSize / 1024).toFixed(1)}K
          </div>
          <div className="text-[10px] text-zinc-500">{snippets.total} snippets · {knowledgeGraph.edges} relations</div>
        </div>
      </div>

      {/* ── Agent Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {agents.map((agent) => (
          <div key={agent.id} className={`rounded-xl border p-3 transition-colors ${
            agent.status === 'active' ? 'border-emerald-500/20 bg-emerald-500/5' :
            agent.status === 'waiting' ? 'border-amber-500/20 bg-amber-500/5' :
            'border-zinc-700/30 bg-zinc-800/20'
          }`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot(agent.status)}`} />
              <span className="text-xs font-medium text-zinc-200">{agent.id}</span>
            </div>
            <div className="text-[10px] text-zinc-500 mb-2">{agent.description}</div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className={`px-1.5 py-0.5 rounded ${agent.schedule === 'on-deploy' ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                {agent.schedule}
              </span>
              <span className="text-zinc-500">actions: {agent.memory.totalActions}</span>
              <span className="text-zinc-500">recalls: {agent.memory.recallCount}</span>
            </div>
            {agent.decisions.lastDecision && (
              <div className="mt-2 text-[10px] text-zinc-500 truncate" title={agent.decisions.lastDecision}>
                last: {agent.decisions.lastDecision.slice(0, 40)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Recent Decisions ───────────────────────────────── */}
      {decisions.recent.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Recent Decisions</h4>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {decisions.recent.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1 rounded bg-zinc-800/30 border border-zinc-700/20">
                <span className="text-zinc-500 w-12 shrink-0">{(d.timestamp || '').slice(11, 19)}</span>
                <span className="text-violet-400 w-20 shrink-0">{d.agentId?.slice(0, 18)}</span>
                <span className="text-zinc-300 truncate">{d.decision?.slice(0, 50)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Recalled Snippets ───────────────────────────── */}
      {snippets.topRecalled.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Top Recalled Knowledge</h4>
          <div className="flex flex-wrap gap-1.5">
            {snippets.topRecalled.map((s) => (
              <span key={s.id} className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {s.id} ({s.recallCount})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
