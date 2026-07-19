import { create } from 'zustand';

interface UIState {
  isConsoleExpanded: boolean;
  toggleConsole: () => void;
  setConsoleExpanded: (expanded: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isConsoleExpanded: false,
  toggleConsole: () => set((state) => ({ isConsoleExpanded: !state.isConsoleExpanded })),
  setConsoleExpanded: (expanded: boolean) => set({ isConsoleExpanded: expanded }),
}));
