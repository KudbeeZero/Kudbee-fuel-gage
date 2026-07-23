import { create } from 'zustand';
import type { OSPlugin } from '../core/pluginRegistry';
import { getAllPlugins } from '../core/pluginRegistry';

interface PluginStore {
  plugins: OSPlugin[];
  activePluginId: string | null;
  setActive: (id: string | null) => void;
  refresh: () => void;
}

export const usePluginStore = create<PluginStore>((set) => ({
  plugins: getAllPlugins(),
  activePluginId: null,
  setActive: (id) => set({ activePluginId: id }),
  refresh: () => set({ plugins: getAllPlugins() }),
}));
