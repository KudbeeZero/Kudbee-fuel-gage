import { useEffect, useState } from 'react';
import { ChevronDown, Building2, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, Eye, Check } from 'lucide-react';
import { useTenantStore, type Tenant, type TenantRole } from '../store/tenantStore';

const ROLE_META: Record<TenantRole, { label: string; color: string; icon: typeof ShieldCheck }> = {
  ADMIN: { label: 'Admin', color: 'text-rose-300 border-rose-500/30 bg-rose-500/10', icon: ShieldAlert },
  OPERATOR: { label: 'Operator', color: 'text-amber-300 border-amber-500/30 bg-amber-500/10', icon: ShieldCheck },
  AUDITOR: { label: 'Auditor', color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10', icon: Eye }
};

export function WorkspaceBar() {
  const { tenants, currentTenantId, loading, error, fetchTenants, switchTenant } = useTenantStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (tenants.length === 0) {
      void fetchTenants();
    }
  }, [tenants.length, fetchTenants]);

  const current: Tenant | null = tenants.find((t) => t.id === currentTenantId) || null;

  const handleSwitch = (id: string) => {
    switchTenant(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        id="workspace-bar-trigger"
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-700/60 bg-slate-900/60 hover:bg-slate-900 transition-colors"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
        ) : (
          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <div className="flex flex-col items-start leading-tight">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Workspace</span>
          <span className="font-mono text-[11px] text-slate-200 max-w-[180px] truncate">
            {current ? current.name : '[UNVERIFIED]'}
          </span>
        </div>
        {current && (
          <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${ROLE_META[current.role].color}`}>
            {ROLE_META[current.role].label}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="workspace-bar-dropdown"
            className="absolute right-0 top-full mt-2 w-72 z-50 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Switch workspace</span>
              {loading && <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />}
            </div>
            {error && (
              <div className="p-2 flex items-center gap-1.5 border-b border-slate-800">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="font-mono text-[10px] text-amber-300">{error}</span>
              </div>
            )}
            {tenants.length === 0 ? (
              <div className="p-3 font-mono text-[10px] text-slate-500">[NO TENANTS AVAILABLE]</div>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {tenants.map((t) => {
                  const meta = ROLE_META[t.role];
                  const Icon = meta.icon;
                  const isActive = t.id === currentTenantId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => handleSwitch(t.id)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors ${
                          isActive ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[11px] text-slate-200 truncate">{t.name}</div>
                          <div className="font-mono text-[9px] text-slate-500">{t.id}</div>
                        </div>
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${meta.color}`}>
                          {meta.label}
                        </span>
                        {isActive && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="px-3 py-1.5 border-t border-slate-800 font-mono text-[9px] text-slate-600">
              {current ? `Active: ${current.id}` : '[NO WORKSPACE SELECTED]'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
