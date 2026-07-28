import { useMemo } from 'react';
import {
  Activity,
  Radio,
  WifiOff,
  Mail,
  Clock,
  Users,
  MessageSquare,
  RefreshCw,
  Terminal,
  ShieldAlert,
} from 'lucide-react';
import { useAgentStatus } from '../../hooks/useAgentStatus';

export default function MonitorPanel() {
  const { data, loading, error, refresh: reload } = useAgentStatus();

  const agents = useMemo(() => (data?.agents ?? []).map((a) => ({
    id: a.id,
    online: a.status === 'online' || a.status === 'active' || a.status === 'processing',
    fleetStatus: a.status,
    fleetTask: a.memory?.lastAction ?? 'idle',
  })), [data]);

  const online = agents.filter((a) => a.online).length;
  const total = agents.length;
  const timestamp = data?.timestamp ?? '';

  return (
    <div className="space-y-4 p-4 text-sm font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-zinc-100">Agent Monitor</h2>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Online</div>
          <div className="text-lg font-bold text-emerald-400">{online}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Total</div>
          <div className="text-lg font-bold text-zinc-200">{total}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Offline</div>
          <div className="text-lg font-bold text-red-400">{total - online}</div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg">
        <div className="grid grid-cols-6 gap-2 px-4 py-2 border-b border-zinc-800 text-[10px] text-zinc-600 uppercase tracking-wider">
          <span>Status</span>
          <span className="col-span-2">Agent</span>
          <span>Last Seen</span>
          <span>Task</span>
          <span className="text-right">VMs</span>
        </div>
        <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
          {agents.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">
              <Terminal className="w-6 h-6 mx-auto mb-2 opacity-30" />
              No agents detected. Start the monitor daemon or register an agent.
            </div>
          )}
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`grid grid-cols-6 gap-2 px-4 py-2.5 text-xs items-center ${
                agent.online ? 'hover:bg-emerald-900/10' : 'hover:bg-zinc-800/50 opacity-70'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    agent.online ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`}
                />
                <span className={agent.online ? 'text-emerald-400' : 'text-zinc-500'}>
                  {agent.online ? 'ON' : 'OFF'}
                </span>
              </div>
              <span className="col-span-2 text-zinc-200 truncate" title={agent.id}>
                {agent.id}
              </span>
              <span className="text-zinc-500">—</span>
              <span className="text-zinc-500">
                {agent.fleetTask === 'idle' ? (
                  <span className="text-zinc-600">idle</span>
                ) : (
                  <span className="text-emerald-400">active</span>
                )}
              </span>
              <span className="text-right text-zinc-600">0</span>
            </div>
          ))}
        </div>
      </div>

      {timestamp && (
        <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-600">
          <Clock className="w-3 h-3" />
          Updated: {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
