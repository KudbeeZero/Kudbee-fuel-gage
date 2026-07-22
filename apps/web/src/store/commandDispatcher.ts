import { create } from 'zustand';
import { useTerminalStore } from './terminalStore';
import { apiPost, apiPatch } from '../lib/apiClient';

export type CommandState = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type CommandKind =
  | 'HERMES_AUDIT'
  | 'CLEAR_TRIAGE'
  | 'RESYNC_VECTOR'
  | 'VERIFY_TRACE'
  | 'CRUCIBLE_DISPATCH'
  | 'PLAYGROUND_RUN'
  | 'TELEMETRY_PURGE'
  | 'PROPOSE_GOVERNANCE';

export interface DispatchedCommand {
  id: string;
  kind: CommandKind;
  label: string;
  description: string;
  state: CommandState;
  startedAt: number;
  finishedAt?: number;
  detail?: string;
  traceId?: string;
}

interface CommandDispatcherState {
  commands: DispatchedCommand[];
  enqueue: (cmd: Omit<DispatchedCommand, 'id' | 'state' | 'startedAt'>) => string;
  setState: (id: string, state: CommandState, detail?: string) => void;
  clear: () => void;
}

const MAX_HISTORY = 50;

function pushTerminalLog(entry: {
  id: string;
  type: 'info' | 'warning' | 'error' | 'slate';
  label: string;
  message: string;
}) {
  useTerminalStore.getState().pushExternalLog({
    ...entry,
    time: new Date().toLocaleTimeString()
  });
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cmd-${Date.now()}-${counter}`;
}

export const useCommandDispatcher = create<CommandDispatcherState>((set) => ({
  commands: [],
  enqueue: (cmd) => {
    const id = nextId();
    const entry: DispatchedCommand = {
      id,
      kind: cmd.kind,
      label: cmd.label,
      description: cmd.description,
      state: 'QUEUED',
      startedAt: Date.now()
    };
    set((state) => ({ commands: [entry, ...state.commands].slice(0, MAX_HISTORY) }));
    pushTerminalLog({
      id: `${id}-queued`,
      type: 'slate',
      label: 'DISPATCH',
      message: `[QUEUED] ${cmd.label} — ${cmd.description}`
    });
    return id;
  },
  setState: (id, state, detail) => {
    set((s) => ({
      commands: s.commands.map((c) =>
        c.id === id
          ? {
              ...c,
              state,
              detail: detail ?? c.detail,
              finishedAt: state === 'SUCCESS' || state === 'FAILED' ? Date.now() : c.finishedAt
            }
          : c
      )
    }));
    const target = useCommandDispatcher.getState().commands.find((c) => c.id === id);
    if (!target) return;
    const logType: 'info' | 'warning' | 'error' | 'slate' =
      state === 'SUCCESS' ? 'info' : state === 'FAILED' ? 'error' : 'slate';
    pushTerminalLog({
      id: `${id}-${state}`,
      type: logType,
      label: 'DISPATCH',
      message: `[${state}] ${target.label}${detail ? ` — ${detail}` : ''}`
    });
  },
  clear: () => set({ commands: [] })
}));

export interface DispatcherOptions {
  kind: CommandKind;
  label: string;
  description: string;
  run: (setState: (state: CommandState, detail?: string) => void) => Promise<{ success: boolean; detail?: string; traceId?: string }>;
}

export async function runWithDispatcher(opts: DispatcherOptions): Promise<{ id: string; success: boolean; detail?: string }> {
  const { enqueue, setState } = useCommandDispatcher.getState();
  const id = enqueue({ kind: opts.kind, label: opts.label, description: opts.description });
  setState(id, 'PROCESSING');
  try {
    const result = await opts.run((state, detail) => setState(id, state, detail));
    setState(id, result.success ? 'SUCCESS' : 'FAILED', result.detail);
    return { id, success: result.success, detail: result.detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState(id, 'FAILED', message);
    return { id, success: false, detail: message };
  }
}

export const commandRunners = {
  hermesAudit: () =>
    runWithDispatcher({
      kind: 'HERMES_AUDIT',
      label: 'Trigger HERMES Audit',
      description: 'Spawn auditor sweep across recent reasoning events',
      run: async (setState) => {
        setState('PROCESSING', 'Auditing reasoning ledger…');
        const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
          '/api/governance/dispatch',
          { task: 'hermes-audit' }
        );
        return {
          success: !!res?.success,
          detail: res?.message || `cycle ${res?.cycle ?? '?'} dispatched`,
          traceId: res?.traceId
        };
      }
    }),
  clearTriage: () =>
    runWithDispatcher({
      kind: 'CLEAR_TRIAGE',
      label: 'Clear Triage Queue',
      description: 'Re-validate and clear the interceptor triage backlog',
      run: async (setState) => {
        setState('PROCESSING', 'Purging triage records…');
        const res = await apiPost<{ ok?: boolean; count?: number; message?: string }>(
          '/api/telemetry/purge',
          { source: 'triage' }
        );
        return {
          success: !!res?.ok,
          detail: res?.message || `${res?.count ?? 0} records cleared`
        };
      }
    }),
  resyncVector: () =>
    runWithDispatcher({
      kind: 'RESYNC_VECTOR',
      label: 'Re-sync Vector Store',
      description: 'Force vector memory reconciliation pass',
      run: async (setState) => {
        setState('PROCESSING', 'Reconciling vector memory…');
        const res = await apiPost<{ success?: boolean; indexed?: number; message?: string }>(
          '/api/telemetry/ingest',
          {
            trace_id: `resync-${Date.now()}`,
            model: 'vector-resync',
            tokens_in: 0,
            tokens_out: 0,
            cost: 0,
            status: 'RESYNC_PROBE',
            provider: 'system',
            project_name: 'kilo-fuel-gauge',
            thought_summary: 'vector resync probe'
          }
        );
        return {
          success: !!res?.success,
          detail: res?.message || 'vector memory reconciliation complete'
        };
      }
    }),
  verifyTrace: (traceId: number | string) =>
    runWithDispatcher({
      kind: 'VERIFY_TRACE',
      label: 'Verify Trace',
      description: `Re-validate trace #${traceId} through the interceptor`,
      run: async (setState) => {
        setState('PROCESSING', 'Running interceptor re-validation…');
        const res = await apiPatch<{ ok?: boolean; message?: string }>(
          `/api/interceptor/revalidate/${traceId}`,
          {}
        );
        return {
          success: !!res?.ok,
          detail: res?.message || `trace ${traceId} verified`,
          traceId: String(traceId)
        };
      }
    }),
  crucibleDispatch: () =>
    runWithDispatcher({
      kind: 'CRUCIBLE_DISPATCH',
      label: 'Run Crucible Cycle',
      description: 'Trigger a single Crucible reasoning cycle',
      run: async (setState) => {
        setState('PROCESSING', 'Crucible spinning up…');
        const res = await apiPost<{ success?: boolean; cycle?: number; message?: string; traceId?: string }>(
          '/api/governance/dispatch',
          { task: 'manual-dispatch' }
        );
        return {
          success: !!res?.success,
          detail: res?.message || `cycle ${res?.cycle ?? '?'} complete`,
          traceId: res?.traceId
        };
      }
    }),
  telemetryPurge: () =>
    runWithDispatcher({
      kind: 'TELEMETRY_PURGE',
      label: 'Purge Telemetry Ledger',
      description: 'Reset the telemetry_traces table (irreversible)',
      run: async () => {
        const res = await apiPost<{ ok?: boolean; count?: number }>(
          '/api/telemetry/purge',
          { source: 'all' }
        );
        return {
          success: !!res?.ok,
          detail: `${res?.count ?? 0} traces removed`
        };
      }
    })
};
