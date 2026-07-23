import { create } from 'zustand';
import { apiGet } from '../lib/apiClient';

export type TenantRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

export interface Tenant {
  id: string;
  name: string;
  role: TenantRole;
}

interface TenantState {
  tenants: Tenant[];
  currentTenantId: string;
  loading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  current: () => Tenant | null;
}

const STORAGE_KEY = 'kudbee.tenant.current';

function loadStored(): string {
  if (typeof window === 'undefined') return 'tenant-prod';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || 'tenant-prod';
  } catch {
    return 'tenant-prod';
  }
}

function persist(id: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenants: [],
  currentTenantId: loadStored(),
  loading: false,
  error: null,

  fetchTenants: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiGet<{ tenants: Tenant[]; current: string }>('/api/governance/tenants');
      set({
        tenants: Array.isArray(data.tenants) ? data.tenants : [],
        currentTenantId: data.current || get().currentTenantId,
        loading: false
      });
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : 'Failed to load tenants',
        loading: false
      });
    }
  },

  switchTenant: (tenantId: string) => {
    persist(tenantId);
    set({ currentTenantId: tenantId });
  },

  current: () => {
    const { tenants, currentTenantId } = get();
    return tenants.find((t) => t.id === currentTenantId) || null;
  }
}));

export function tenantFetchHeaders(): HeadersInit {
  return { 'X-Tenant-Id': useTenantStore.getState().currentTenantId };
}
