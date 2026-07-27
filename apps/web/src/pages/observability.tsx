import { Gauge, RefreshCw, AlertCircle } from 'lucide-react';
import { useMiddlewareStatus } from '../hooks/useMiddlewareStatus';
import { useAgentStatus } from '../hooks/useAgentStatus';
import { useTerminalMirror } from '../hooks/useTerminalMirror';
import { MiddlewareInspector } from '../components/observability/MiddlewareInspector';
import { RouteLatencyMonitor } from '../components/observability/RouteLatencyMonitor';
import { AgentFleetMonitor } from '../components/observability/AgentFleetMonitor';
import { TerminalMirror } from '../components/observability/TerminalMirror';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';

export function ObservabilityPage() {
  const { guards, routes, timestamp, loading, error, refresh } = useMiddlewareStatus();
  const { data: agentData, loading: agentLoading, error: agentError, refresh: agentRefresh } = useAgentStatus();
  const { data: terminalData, loading: terminalLoading, error: terminalError } = useTerminalMirror();

  return (
    <PanelErrorBoundary panel="Observability">
      <div className="h-full overflow-y-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gauge className="w-6 h-6 text-violet-400" />
            <h2 className="text-xl font-bold text-zinc-100">Observability</h2>
          </div>
          <div className="flex items-center gap-3">
            {timestamp && (
              <span className="text-xs text-zinc-500 font-mono">
                Updated: {new Date(timestamp).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-sm text-zinc-300 disabled:opacity-50 transition-colors"
              aria-label="Refresh middleware status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && guards.length === 0 && (
          <div className="flex items-center gap-3 text-zinc-500 text-sm p-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Connecting to middleware diagnostics...
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-3">
            <PanelErrorBoundary panel="Middleware Inspector">
              <MiddlewareInspector guards={guards} />
            </PanelErrorBoundary>
          </div>

          <div className="xl:col-span-3">
            <PanelErrorBoundary panel="Agent Fleet">
              <AgentFleetMonitor data={agentData} loading={agentLoading} error={agentError ?? null} />
            </PanelErrorBoundary>
          </div>

          <div className="xl:col-span-3">
            <PanelErrorBoundary panel="Route Latency Monitor">
              <RouteLatencyMonitor routes={routes} />
            </PanelErrorBoundary>
          </div>

          <div className="xl:col-span-3">
            <PanelErrorBoundary panel="Terminal Mirror">
              <TerminalMirror data={terminalData} loading={terminalLoading} error={terminalError ?? null} />
            </PanelErrorBoundary>
          </div>
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
