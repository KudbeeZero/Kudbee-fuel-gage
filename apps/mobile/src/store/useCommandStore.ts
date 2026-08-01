import { create } from 'zustand';

export type CommandState = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface MobileCommand {
  id: string;
  kind: string;
  label: string;
  description: string;
  state: CommandState;
  startedAt: number;
  finishedAt?: number;
  detail?: string;
  traceId?: string;
}

interface CommandStoreState {
  commands: MobileCommand[];
  controllers: Map<string, AbortController>;
  enqueue: (cmd: Omit<MobileCommand, 'id' | 'state' | 'startedAt'>) => string;
  setState: (id: string, state: CommandState, detail?: string, traceId?: string) => void;
  cancel: (id: string, controller: AbortController) => void;
  clear: () => void;
}

const MAX_HISTORY = 50;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cmd-${Date.now()}-${counter}`;
}

export const useCommandStore = create<CommandStoreState>((set, get) => ({
  commands: [],
  controllers: new Map(),
  enqueue: (cmd) => {
    const active = get().commands.some(
      (c) => c.kind === cmd.kind && (c.state === 'QUEUED' || c.state === 'PROCESSING')
    );
    if (active) return 'duplicate';
    const id = nextId();
    const entry: MobileCommand = {
      id,
      kind: cmd.kind,
      label: cmd.label,
      description: cmd.description,
      state: 'QUEUED',
      startedAt: Date.now(),
    };
    set((state) => ({
      commands: [entry, ...state.commands].slice(0, MAX_HISTORY),
    }));
    return id;
  },
  setState: (id, state, detail, traceId) => {
    set((s) => {
      // Clean up controller when command finishes or fails
      if (state === 'SUCCESS' || state === 'FAILED') {
        const ctrl = get().controllers.get(id);
        if (ctrl) {
          get().controllers.delete(id);
        }
      }
      return {
        commands: s.commands.map((c) =>
          c.id === id
            ? {
                ...c,
                state,
                detail: detail ?? c.detail,
                traceId: traceId ?? c.traceId,
                finishedAt:
                  state === 'SUCCESS' || state === 'FAILED'
                    ? Date.now()
                    : c.finishedAt,
              }
            : c
        ),
      };
    });
  },
  cancel: (id, controller) => {
    set((state) => ({
      controllers: new Map(state.controllers).set(id, controller),
    }));
  },
  clear: () => set({ commands: [], controllers: new Map() }),
}));
