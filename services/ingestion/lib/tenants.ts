/**
 * services/ingestion/lib/tenants.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for tenant registry + RBAC rank. Both server.js
 * and the modular sub-routers import from this file to avoid circular
 * dependencies and the "Cannot access X before initialization" trap that
 * occurs when route modules are mounted before the server has finished
 * declaring its global state.
 * ---------------------------------------------------------------------------
 */

export type TenantRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

export interface Tenant {
  id: string;
  name: string;
  role: TenantRole;
}

export const TENANTS: Record<string, Tenant> = {
  'tenant-prod': { id: 'tenant-prod', name: 'Production / Default Workspace', role: 'ADMIN' },
  'tenant-staging': { id: 'tenant-staging', name: 'Staging / Tenant B', role: 'OPERATOR' },
  'tenant-audit': { id: 'tenant-audit', name: 'Auditor / Read-Only', role: 'AUDITOR' }
};

export const ROLE_RANK: Record<TenantRole, number> = { AUDITOR: 1, OPERATOR: 2, ADMIN: 3 };

export const RBAC_MATRIX: Record<string, TenantRole> = {
  '/api/governance/tune/apply': 'ADMIN',
  '/api/governance/policies': 'OPERATOR',
  '/api/governance/feedback': 'OPERATOR',
  '/api/governance/tasks/enqueue': 'OPERATOR',
  '/api/governance/failed/retry': 'OPERATOR',
  '/api/governance/failed/discard': 'ADMIN',
  '/api/audit/export': 'AUDITOR',
  '/api/audit/vault/anchor': 'ADMIN',
  '/api/audit/vault/verify': 'AUDITOR',
  '/api/governance/dispatch': 'OPERATOR',
  '/api/agents/crucible/run': 'ADMIN'
};

export function resolveTenantId(req: any): string {
  const headerTenant = req.headers?.['x-tenant-id'];
  const queryTenant = req.query?.tenantId;
  const candidate = String(headerTenant || queryTenant || 'tenant-prod');
  return TENANTS[candidate] ? candidate : 'tenant-prod';
}

export function requireRole(req: any, res: any, minRole: TenantRole): { tenantId: string; role: TenantRole; name: string } | null {
  const tenantId = resolveTenantId(req);
  const tenant = TENANTS[tenantId];
  if (!tenant) {
    res.status(403).json({ error: 'unknown tenant', tenantId });
    return null;
  }
  if (ROLE_RANK[tenant.role] < ROLE_RANK[minRole]) {
    res.status(403).json({
      error: 'forbidden',
      reason: `tenant ${tenantId} has role ${tenant.role}, requires ${minRole}`,
      tenantId,
      role: tenant.role,
      required: minRole
    });
    return null;
  }
  return { tenantId, role: tenant.role, name: tenant.name };
}
