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

export interface TenantMembership {
  tenantId: string;
  role: TenantRole;
}

export interface TenantContext extends TenantMembership {
  agentId: string;
  name: string;
}

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

const VALID_ROLES = new Set<TenantRole>(['ADMIN', 'OPERATOR', 'AUDITOR']);

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && VALID_ROLES.has(value as TenantRole);
}

function normalizeMembership(value: unknown): TenantMembership | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  const tenantId = typeof candidate.tenantId === 'string' ? candidate.tenantId : null;
  const role = candidate.role;
  if (!tenantId || !TENANTS[tenantId] || !isTenantRole(role)) return null;
  return { tenantId, role };
}

function addMembership(
  memberships: Map<string, TenantMembership[]>,
  agentId: unknown,
  value: unknown,
): void {
  if (typeof agentId !== 'string' || agentId.length === 0) return;
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.map(normalizeMembership).filter((item): item is TenantMembership => item !== null);
  if (normalized.length !== values.length || normalized.length === 0) return;
  memberships.set(agentId, normalized);
}

/**
 * Parse the explicit, non-secret server membership map on every lookup. This
 * intentionally has no default and does not cache invalid configuration so a
 * corrected deployment environment takes effect without a process fallback.
 *
 * Supported shape:
 *   { "agent-id": { "tenantId": "tenant-staging", "role": "OPERATOR" } }
 */
export function loadTenantMemberships(raw = process.env.KUDBEE_TENANT_MEMBERSHIPS): Map<string, TenantMembership[]> {
  const memberships = new Map<string, TenantMembership[]>();
  if (!raw || raw.trim().length === 0) return memberships;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return memberships;

    const source = parsed as Record<string, unknown>;
    for (const [agentId, value] of Object.entries(source)) {
      addMembership(memberships, agentId, value);
    }
  } catch {
    return new Map();
  }

  return memberships;
}

export function resolveTenantContext(req: any): TenantContext | null {
  if (!req?.authenticated || typeof req.agentId !== 'string' || req.agentId.length === 0) {
    return null;
  }

  const memberships = loadTenantMemberships().get(req.agentId) || [];
  // A client cannot select among multiple memberships. Fail closed rather
  // than choosing an arbitrary tenant context.
  if (memberships.length !== 1) return null;

  const membership = memberships[0];
  if (!membership) return null;
  const tenant = TENANTS[membership.tenantId];
  if (!tenant) return null;

  return { agentId: req.agentId, tenantId: tenant.id, role: membership.role, name: tenant.name };
}

export function resolveTenantId(req: any): string | null {
  return resolveTenantContext(req)?.tenantId || null;
}

export function requireRole(req: any, res: any, minRole: TenantRole): TenantContext | null {
  if (!req?.authenticated || typeof req.agentId !== 'string' || req.agentId.length === 0) {
    res.status(401).json({ error: 'unauthorized', message: 'Authenticated server principal required' });
    return null;
  }

  const ctx = resolveTenantContext(req);
  if (!ctx) {
    delete req.tenantCtx;
    res.status(403).json({ error: 'forbidden', reason: 'Tenant membership required' });
    return null;
  }

  if (!isTenantRole(minRole) || ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) {
    res.status(403).json({
      error: 'forbidden',
      reason: `tenant ${ctx.tenantId} has role ${ctx.role}, requires ${minRole}`,
      tenantId: ctx.tenantId,
      role: ctx.role,
      required: minRole
    });
    return null;
  }

  req.tenantCtx = ctx;
  return ctx;
}

/**
 * Tenant scoping middleware — validates any client-supplied `X-Tenant-Id`
 * header against the authenticated principal's membership and stamps a
 * trusted `req.tenantCtx`. Fails closed (403) on spoofing.
 *
 * Behavior matrix:
 *   - Unauthenticated (Mode A / open): no identity → req.tenantCtx = null,
 *     header ignored (no cross-tenant trust claim is possible).
 *   - Authenticated, exactly one membership: header (if present) MUST match
 *     the membership tenant → 403 on mismatch. Stamps req.tenantCtx.
 *   - Authenticated, 0 or >1 memberships: fail closed → 403.
 */
export function tenantScopeMiddleware(req: any, res: any, next: any): void {
  try {
    const headerTenant = typeof req.headers['x-tenant-id'] === 'string'
      ? req.headers['x-tenant-id'].trim()
      : null;

    // No identity (open access mode) — nothing to scope; do not block.
    if (!req?.authenticated || typeof req.agentId !== 'string' || req.agentId.length === 0) {
      delete req.tenantCtx;
      return next();
    }

    const memberships = loadTenantMemberships().get(req.agentId) || [];
    if (memberships.length !== 1) {
      delete req.tenantCtx;
      res.status(403).json({ error: 'forbidden', reason: 'Tenant membership required (0 or multiple memberships)' });
      return;
    }

    const membership = memberships[0];
    if (!membership) {
      delete req.tenantCtx;
      res.status(403).json({ error: 'forbidden', reason: 'Invalid tenant membership' });
      return;
    }
    const tenant = TENANTS[membership.tenantId];
    if (!tenant) {
      delete req.tenantCtx;
      res.status(403).json({ error: 'forbidden', reason: 'Unknown tenant' });
      return;
    }

    // Header spoofing guard: if present, it must match the principal's tenant.
    if (headerTenant && headerTenant !== tenant.id) {
      delete req.tenantCtx;
      res.status(403).json({
        error: 'forbidden',
        reason: 'X-Tenant-Id does not match the authenticated principal membership',
        tenantId: tenant.id,
      });
      return;
    }

    req.tenantCtx = { agentId: req.agentId, tenantId: tenant.id, role: membership.role, name: tenant.name };
    return next();
  } catch {
    delete req.tenantCtx;
    res.status(403).json({ error: 'forbidden', reason: 'Tenant resolution failed' });
  }
}

/**
 * Per-tenant rate-limit key: uses the resolved tenant id when available,
 * otherwise falls back to the client IP. Enables tenant-level quotas
 * without breaking anonymous access.
 */
export function tenantRateLimitKey(req: any): string {
  const tenant = req?.tenantCtx?.tenantId;
  return typeof tenant === 'string' ? `tenant:${tenant}` : ipFromRequest(req);
}

function ipFromRequest(req: any): string {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    const first = fwd.split(',')[0];
    return typeof first === 'string' ? first.trim() : 'unknown';
  }
  return req?.socket?.remoteAddress || req?.ip || 'unknown';
}
