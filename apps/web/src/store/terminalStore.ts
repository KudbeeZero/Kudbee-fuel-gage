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

const MAX_EXTERNAL_LOGS = 1000;

export const useTerminalStore = create<TerminalState>((set) => ({
  externalLogs: [],
  pushExternalLog: (log) =>
    set((state) => ({ externalLogs: [...state.externalLogs, log].slice(-MAX_EXTERNAL_LOGS) })),
}));
