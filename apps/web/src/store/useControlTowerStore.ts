import { create } from 'zustand';

export interface TelemetryEvent {
  id: string;
  kind: 'telemetry' | 'think_token' | 'groq_route' | 'governance_action';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface GroqRouteMetric {
  id: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  provider: string;
  status: 'OK' | 'ERROR' | 'TIMEOUT';
  timestamp: string;
}

export interface GovernanceProposal {
  id: string;
  agentId: string;
  action: string;
  triggeredRule: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  actionJson: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
}

export interface ThinkTokenRecord {
  id: string;
  tokenHash: string;
  similarityScore: number;
  correctionDelta: string;
  memoryHits: number;
  timestamp: string;
}

export interface LayoutPrefs {
  sidebarCollapsed: boolean;
  activeTab: string;
  hudDensity: 'Compact' | 'Standard' | 'Comfortable';
  hudExpanded: boolean;
}

const MAX_BUFFER = 500;

function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem('kudbee_layout_prefs');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
      return {
        sidebarCollapsed: parsed.sidebarCollapsed ?? false,
        activeTab: parsed.activeTab ?? 'TELEMETRY',
        hudDensity: parsed.hudDensity ?? 'Standard',
        hudExpanded: parsed.hudExpanded ?? true
      };
    }
  } catch { /* ignore */ }
  return { sidebarCollapsed: false, activeTab: 'TELEMETRY', hudDensity: 'Standard', hudExpanded: true };
}

function persistLayoutPrefs(prefs: LayoutPrefs) {
  try {
    localStorage.setItem('kudbee_layout_prefs', JSON.stringify(prefs));
  } catch { /* ignore */ }
}

interface ControlTowerState {
  telemetryEvents: TelemetryEvent[];
  groqMetrics: GroqRouteMetric[];
  governanceProposals: GovernanceProposal[];
  thinkTokenRecords: ThinkTokenRecord[];
  layoutPrefs: LayoutPrefs;

  pushTelemetryEvent: (event: Omit<TelemetryEvent, 'id' | 'timestamp'>) => void;
  pushGroqMetric: (metric: Omit<GroqRouteMetric, 'id' | 'timestamp'>) => void;
  pushGovernanceProposal: (proposal: Omit<GovernanceProposal, 'id' | 'timestamp' | 'status'>) => void;
  updateProposalStatus: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  pushThinkTokenRecord: (record: Omit<ThinkTokenRecord, 'id' | 'timestamp'>) => void;
  setLayoutPrefs: (prefs: Partial<LayoutPrefs>) => void;
  clearBuffers: () => void;
}

let _eventCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_eventCounter}`;
}

export const useControlTowerStore = create<ControlTowerState>((set) => ({
  telemetryEvents: [],
  groqMetrics: [],
  governanceProposals: [],
  thinkTokenRecords: [],
  layoutPrefs: loadLayoutPrefs(),

  pushTelemetryEvent: (event) => {
    const record: TelemetryEvent = {
      ...event,
      id: event.kind + '-' + Date.now() + '-' + (++_eventCounter),
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      telemetryEvents: [record, ...state.telemetryEvents].slice(0, MAX_BUFFER)
    }));
  },

  pushGroqMetric: (metric) => {
    const record: GroqRouteMetric = {
      ...metric,
      id: nextId('groq'),
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      groqMetrics: [record, ...state.groqMetrics].slice(0, MAX_BUFFER)
    }));
  },

  pushGovernanceProposal: (proposal) => {
    const record: GovernanceProposal = {
      ...proposal,
      id: nextId('gov'),
      timestamp: new Date().toISOString(),
      status: 'PENDING'
    };
    set((state) => ({
      governanceProposals: [record, ...state.governanceProposals].slice(0, MAX_BUFFER)
    }));
  },

  updateProposalStatus: (id, status) => {
    set((state) => ({
      governanceProposals: state.governanceProposals.map((p) =>
        p.id === id ? { ...p, status } : p
      )
    }));
  },

  pushThinkTokenRecord: (record) => {
    const entry: ThinkTokenRecord = {
      ...record,
      id: nextId('think'),
      timestamp: new Date().toISOString()
    };
    set((state) => ({
      thinkTokenRecords: [entry, ...state.thinkTokenRecords].slice(0, MAX_BUFFER)
    }));
  },

  setLayoutPrefs: (partial) => {
    set((state) => {
      const next = { ...state.layoutPrefs, ...partial };
      persistLayoutPrefs(next);
      return { layoutPrefs: next };
    });
  },

  clearBuffers: () => {
    set({
      telemetryEvents: [],
      groqMetrics: [],
      governanceProposals: [],
      thinkTokenRecords: []
    });
  }
}));
