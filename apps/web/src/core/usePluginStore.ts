import { create } from 'zustand';
import type { OSPlugin } from '../core/pluginRegistry';
import { getAllPlugins } from '../core/pluginRegistry';

const STORAGE_KEY = 'kudbee_active_plugins';

function loadActivePlugins(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveActivePlugins(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch {}
}

interface PluginStore {
  plugins: OSPlugin[];
  activePluginId: string | null;
  activePlugins: Set<string>;
  setActive: (id: string | null) => void;
  togglePlugin: (id: string) => void;
  isPluginEnabled: (id: string) => boolean;
  refresh: () => void;
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  plugins: getAllPlugins(),
  activePluginId: null,
  activePlugins: loadActivePlugins(),
  setActive: (id) => set({ activePluginId: id }),
  togglePlugin: (id) => {
    const next = new Set(get().activePlugins);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveActivePlugins(next);
    set({ activePlugins: next });
  },
  isPluginEnabled: (id) => get().activePlugins.has(id),
  refresh: () => set({ plugins: getAllPlugins() }),
}));
