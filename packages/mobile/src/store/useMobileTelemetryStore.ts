import { create } from 'zustand';

export interface MobileTelemetrySnapshot {
  id: string;
  agentId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  provider: string;
  status: 'OK' | 'ERROR' | 'PENDING';
  timestamp: string;
  synced: boolean;
}

export interface MobileGovernanceItem {
  id: string;
  action: string;
  agentId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
}

export interface MobileLayoutPrefs {
  theme: 'dark' | 'midnight';
  reducedMotion: boolean;
  telemetryRefreshMs: number;
  notificationsEnabled: boolean;
}

const MAX_SNAPSHOTS = 200;
const MAX_GOVERNANCE_ITEMS = 100;

interface MobileTelemetryState {
  snapshots: MobileTelemetrySnapshot[];
  governanceItems: MobileGovernanceItem[];
  layoutPrefs: MobileLayoutPrefs;
  online: boolean;
  lastSyncAt: string | null;

  pushSnapshot: (snapshot: Omit<MobileTelemetrySnapshot, 'id' | 'timestamp' | 'synced'>) => void;
  updateSyncStatus: (ids: string[]) => void;
  pushGovernanceItem: (item: Omit<MobileGovernanceItem, 'id' | 'timestamp'>) => void;
  updateGovernanceStatus: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  setOnline: (online: boolean) => void;
  setLastSyncAt: (ts: string) => void;
  setLayoutPrefs: (prefs: Partial<MobileLayoutPrefs>) => void;
  clearSnapshots: () => void;
  pushMemoryStored: (memory: { id: string; content: string; category: string; importance: number }) => void;
  incrementMemoryRecall: () => void;
}

let _counter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;
}

function loadLayoutPrefs(): MobileLayoutPrefs {
  try {
    const raw = localStorage.getItem('kudbee_mobile_layout');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MobileLayoutPrefs>;
      return {
        theme: parsed.theme ?? 'dark',
        reducedMotion: parsed.reducedMotion ?? false,
        telemetryRefreshMs: parsed.telemetryRefreshMs ?? 5000,
        notificationsEnabled: parsed.notificationsEnabled ?? true
      };
    }
  } catch { /* ignore */ }
  return { theme: 'dark', reducedMotion: false, telemetryRefreshMs: 5000, notificationsEnabled: true };
}

function persistLayoutPrefs(prefs: MobileLayoutPrefs): void {
  try {
    localStorage.setItem('kudbee_mobile_layout', JSON.stringify(prefs));
    localStorage.setItem('kudbee_cross_platform_layout', JSON.stringify({
      ...prefs,
      platform: 'mobile',
      syncedAt: new Date().toISOString()
    }));
  } catch { /* ignore */ }
}

export const useMobileTelemetryStore = create<MobileTelemetryState>((set) => ({
  snapshots: [],
  governanceItems: [],
  layoutPrefs: loadLayoutPrefs(),
  online: typeof navigator !== 'undefined' ? navigator.onLine ?? true : true,
  lastSyncAt: null,

  pushSnapshot: (snapshot) => {
    const record: MobileTelemetrySnapshot = {
      ...snapshot,
      id: nextId('mobile-snap'),
      timestamp: new Date().toISOString(),
      synced: false
    };
    set((state) => ({
      snapshots: [record, ...state.snapshots].slice(0, MAX_SNAPSHOTS)
    }));
  },

  updateSyncStatus: (ids) => {
    set((state) => ({
      snapshots: state.snapshots.map((s) =>
        ids.includes(s.id) ? { ...s, synced: true } : s
      )
    }));
  },

  pushGovernanceItem: (item) => {
    const record: MobileGovernanceItem = {
      ...item,
      id: nextId('mobile-gov'),
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      governanceItems: [record, ...state.governanceItems].slice(0, MAX_GOVERNANCE_ITEMS)
    }));
  },

  updateGovernanceStatus: (id, status) => {
    set((state) => ({
      governanceItems: state.governanceItems.map((g) =>
        g.id === id ? { ...g, status } : g
      )
    }));
  },

  setOnline: (online) => set({ online }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),

  setLayoutPrefs: (partial) => {
    set((state) => {
      const next = { ...state.layoutPrefs, ...partial };
      persistLayoutPrefs(next);
      return { layoutPrefs: next };
    });
  },

  clearSnapshots: () => set({ snapshots: [] }),

  pushMemoryStored: (memory) => {
    const item: MobileGovernanceItem = {
      id: nextId('mobile-mem'),
      action: `Memory stored: ${memory.content.slice(0, 50)}`,
      agentId: 'memory-pipeline',
      riskLevel: 'LOW',
      status: 'APPROVED',
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      governanceItems: [item, ...state.governanceItems].slice(0, MAX_GOVERNANCE_ITEMS)
    }));
  },

  incrementMemoryRecall: () => {
    const item: MobileGovernanceItem = {
      id: nextId('mobile-rec'),
      action: 'Memory recall executed',
      agentId: 'memory-pipeline',
      riskLevel: 'LOW',
      status: 'APPROVED',
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      governanceItems: [item, ...state.governanceItems].slice(0, MAX_GOVERNANCE_ITEMS)
    }));
  }
}));
