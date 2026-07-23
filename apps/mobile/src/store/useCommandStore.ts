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
}

interface CommandStoreState {
  commands: MobileCommand[];
  enqueue: (cmd: Omit<MobileCommand, 'id' | 'state' | 'startedAt'>) => string;
  setState: (id: string, state: CommandState, detail?: string) => void;
  clear: () => void;
}

const MAX_HISTORY = 50;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cmd-${Date.now()}-${counter}`;
}

export const useCommandStore = create<CommandStoreState>((set) => ({
  commands: [],
  enqueue: (cmd) => {
    const active = useCommandStore
      .getState()
      .commands.some(
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
  setState: (id, state, detail) => {
    set((s) => ({
      commands: s.commands.map((c) =>
        c.id === id
          ? {
              ...c,
              state,
              detail: detail ?? c.detail,
              finishedAt:
                state === 'SUCCESS' || state === 'FAILED'
                  ? Date.now()
                  : c.finishedAt,
            }
          : c
      ),
    }));
  },
  clear: () => set({ commands: [] }),
}));
