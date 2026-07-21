import { create } from 'zustand';

export interface ConsoleLog {
  id: string;
  type: 'info' | 'warning' | 'error' | 'slate';
  label: string;
  message: string;
  time: string;
}

interface TerminalState {
  externalLogs: ConsoleLog[];
  pushExternalLog: (log: ConsoleLog) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  externalLogs: [],
  pushExternalLog: (log) =>
    set((state) => ({ externalLogs: [...state.externalLogs, log] })),
}));
