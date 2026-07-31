import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { requireRole, resolveTenantId } from './tenants.ts';

const MEMBERSHIPS_ENV = 'KUDBEE_TENANT_MEMBERSHIPS';

function request(overrides: Record<string, unknown> = {}): any {
  return {
    authenticated: false,
    agentId: null,
    headers: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function response(): any {
  const result: any = { statusCode: 200, body: null };
  result.status = (statusCode: number) => {
    result.statusCode = statusCode;
    return result;
  };
  result.json = (body: unknown) => {
    result.body = body;
    return result;
  };
  return result;
}

describe('server-derived tenant isolation', () => {
  let previousMemberships: string | undefined;

  beforeEach(() => {
    previousMemberships = process.env[MEMBERSHIPS_ENV];
    delete process.env[MEMBERSHIPS_ENV];
  });

  afterEach(() => {
    if (previousMemberships === undefined) delete process.env[MEMBERSHIPS_ENV];
    else process.env[MEMBERSHIPS_ENV] = previousMemberships;
  });

  it('returns 401 when the request is unauthenticated', () => {
    process.env[MEMBERSHIPS_ENV] = JSON.stringify({
      'agent-admin': { tenantId: 'tenant-staging', role: 'ADMIN' },
    });
    const req = request({
      headers: { 'x-tenant-id': 'tenant-prod' },
      query: { tenantId: 'tenant-prod' },
      body: { tenantId: 'tenant-prod' },
    });
    const res = response();

    expect(requireRole(req, res, 'AUDITOR')).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(req.tenantCtx).toBeUndefined();
  });

  it('returns 403 for an authenticated principal without membership', () => {
    const req = request({
      authenticated: true,
      agentId: 'agent-without-membership',
      headers: { 'x-tenant-id': 'tenant-prod' },
      query: { tenantId: 'tenant-prod' },
      body: { tenantId: 'tenant-prod' },
    });
    const res = response();

    expect(requireRole(req, res, 'AUDITOR')).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.reason).toBe('Tenant membership required');
    expect(JSON.stringify(res.body)).not.toContain('tenant-prod');
  });

  it('derives a valid context from the principal membership', () => {
    process.env[MEMBERSHIPS_ENV] = JSON.stringify({
      'agent-operator': { tenantId: 'tenant-staging', role: 'OPERATOR' },
    });
    const req = request({
      authenticated: true,
      agentId: 'agent-operator',
      roles: ['ADMIN'],
      headers: { 'x-tenant-id': 'tenant-prod' },
      query: { tenantId: 'tenant-prod' },
      body: { tenantId: 'tenant-prod' },
    });
    const res = response();

    const ctx = requireRole(req, res, 'OPERATOR');

    expect(ctx).toEqual({
      agentId: 'agent-operator',
      tenantId: 'tenant-staging',
      role: 'OPERATOR',
      name: 'Staging / Tenant B',
    });
    expect(req.tenantCtx).toEqual(ctx);
    expect(resolveTenantId(req)).toBe('tenant-staging');
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 for a principal with an insufficient configured role', () => {
    process.env[MEMBERSHIPS_ENV] = JSON.stringify({
      'agent-auditor': { tenantId: 'tenant-audit', role: 'AUDITOR' },
    });
    const req = request({
      authenticated: true,
      agentId: 'agent-auditor',
      headers: { 'x-tenant-id': 'tenant-prod' },
    });
    const res = response();

    expect(requireRole(req, res, 'ADMIN')).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.tenantId).toBe('tenant-audit');
    expect(res.body.role).toBe('AUDITOR');
  });

  it('fails closed for missing, invalid, and malformed membership configuration', () => {
    const cases = [undefined, '{}', '{not-json', JSON.stringify({ 'agent-admin': { tenantId: 'unknown', role: 'ADMIN' } })];

    for (const raw of cases) {
      if (raw === undefined) delete process.env[MEMBERSHIPS_ENV];
      else process.env[MEMBERSHIPS_ENV] = raw;

      const req = request({ authenticated: true, agentId: 'agent-admin' });
      const res = response();

      expect(resolveTenantId(req)).toBeNull();
      expect(requireRole(req, res, 'ADMIN')).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('tenant-prod');
    }
  });

  it('does not use a tenant-prod fallback when no principal is present', () => {
    expect(resolveTenantId(request())).toBeNull();
    expect(resolveTenantId(request({ authenticated: true, agentId: 'unknown-agent' }))).toBeNull();
  });
});
