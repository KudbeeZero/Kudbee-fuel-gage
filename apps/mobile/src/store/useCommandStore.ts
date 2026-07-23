import { create } from 'zustand';

export type CommandState = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface CommandLog {
  id: string;
  label: string;
  state: CommandState;
  detail?: string;
  time: string;
}

interface CommandStore {
  logs: CommandLog[];
  addLog: (log: Omit<CommandLog, 'id' | 'time'>) => string;
  clear: () => void;
}

let counter = 0;
function nextId() {
  counter += 1;
  return `cmd-${Date.now()}-${counter}`;
}

export const useCommandStore = create<CommandStore>((set) => ({
  logs: [],
  addLog: (entry) => {
    const id = nextId();
    const log: CommandLog = {
      ...entry,
      id,
      time: new Date().toLocaleTimeString()
    };
    set((state) => ({ logs: [log, ...state.logs].slice(0, 50) }));
    return id;
  },
  clear: () => set({ logs: [] }),
}));
