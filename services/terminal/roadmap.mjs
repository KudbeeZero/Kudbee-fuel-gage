/**
 * services/terminal/roadmap.mjs
 * ---------------------------------------------------------------------------
 * Phases to Production — the canonical roadmap tracking module.
 *
 * Each phase has:
 *   id          — stable phase identifier (e.g. "PHASE-1")
 *   name        — human label
 *   category    — OPS (platform/reliability) | THINKBOX (user features) | VERIFY (validation)
 *   status      — planned | in_progress | verified | shipped
 *   dependsOn   — phase ids that must complete first
 *   scope       — short description
 *
 * Updated as part of the 3-track cadence:
 *   1. OPS      — platform and reliability (CI, deploys, security, infra)
 *   2. THINKBOX — user-facing features and UX
 *   3. VERIFY   — staging validation and mobile testing
 * ---------------------------------------------------------------------------
 */

export const ROADMAP = {
  version: '0.1',
  updatedAt: '2026-08-04T00:30:00Z',
  mission: 'OPS-017',
  phases: [
    {
      id: 'PHASE-1',
      name: 'Engineering OS Foundation',
      category: 'OPS',
      status: 'shipped',
      dependsOn: [],
      scope: 'Session bootstrap, agent fleet, memory journal, serial bus, phone tree',
    },
    {
      id: 'PHASE-2',
      name: 'CI Reliability',
      category: 'OPS',
      status: 'shipped',
      dependsOn: ['PHASE-1'],
      scope: 'Lifecycle-aware triggers, path filters, lockfile integrity, green main',
    },
    {
      id: 'PHASE-3',
      name: 'External Logic Phase',
      category: 'OPS',
      status: 'shipped',
      dependsOn: ['PHASE-2'],
      scope: 'QStash bridge, Upstash Vector, workflow orchestration, Box test env',
    },
    {
      id: 'PHASE-4',
      name: 'Staging Certification (OPS-017)',
      category: 'VERIFY',
      status: 'verified',
      dependsOn: ['PHASE-3'],
      scope: 'BootVerify, deploy pipeline, health endpoints, terminal, vector, mobile',
    },
    {
      id: 'PHASE-5',
      name: 'System Pulse Dashboard',
      category: 'THINKBOX',
      status: 'in_progress',
      dependsOn: ['PHASE-4'],
      scope: 'Live infra panel: Git SHA, env, Redis/QStash/Vector/Workflow/CI status',
    },
    {
      id: 'PHASE-6',
      name: 'Production Rollout',
      category: 'OPS',
      status: 'planned',
      dependsOn: ['PHASE-4', 'PHASE-5'],
      scope: 'Deploy to kudbee-fuel-gage prod, verify health, enable monitoring',
    },
    {
      id: 'PHASE-7',
      name: 'THINKBOX Product Layer',
      category: 'THINKBOX',
      status: 'planned',
      dependsOn: ['PHASE-5'],
      scope: 'PR-002 Dependency Resolution Engine + user-facing features',
    },
    {
      id: 'PHASE-8',
      name: 'Mobile-First Control Tower',
      category: 'THINKBOX',
      status: 'planned',
      dependsOn: ['PHASE-7'],
      scope: 'Full mobile viewport experience, touch targets, bottom nav',
    },
    {
      id: 'PHASE-9',
      name: 'Multi-Tenant Governance',
      category: 'OPS',
      status: 'planned',
      dependsOn: ['PHASE-8'],
      scope: 'Tenant isolation, RBAC hardening, quota enforcement at scale',
    },
    {
      id: 'PHASE-10',
      name: 'RC1 General Availability',
      category: 'VERIFY',
      status: 'planned',
      dependsOn: ['PHASE-9'],
      scope: 'Full certification, docs freeze, production GA cut',
    },
  ],
};

export function getRoadmapStatus() {
  const phases = ROADMAP.phases;
  const done = phases.filter((p) => p.status === 'shipped').length;
  const inProgress = phases.filter((p) => p.status === 'in_progress').length;
  const verified = phases.filter((p) => p.status === 'verified').length;
  const planned = phases.filter((p) => p.status === 'planned').length;

  const complete = done + verified;

  return {
    version: ROADMAP.version,
    updatedAt: ROADMAP.updatedAt,
    total: phases.length,
    shipped: done,
    inProgress,
    verified,
    planned,
    percentComplete: phases.length ? Math.round((complete / phases.length) * 100) : 0,
    phases,
  };
}
