/**
 * services/lib/capabilityRegistry.ts
 * ---------------------------------------------------------------------------
 * Phase 5B — authoritative read-only capability resolver.
 *
 * Maps `agent identity → role → capabilities`. This is the single source of
 * truth for capability names. It is OBSERVATION-ONLY in this phase — it never
 * denies a request. Enforcement is a later phase.
 *
 * Capabilities are normalized identifiers (not automatic permissions). The
 * registry derives capability sets from role, `allowedIntegrations`, and
 * `writeAuthority` (the existing declarative manifest concepts).
 *
 * This registry is NOT writable through any API route.
 * ---------------------------------------------------------------------------
 */

export type Capability = string;

// Role → base capability set.
export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  viewer: ['read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws'],
  auditor: ['read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws'],
  operator: [
    'read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws',
    'execute:task', 'execute:learning', 'execute:memory', 'execute:think',
    'execute:governance', 'execute:github',
    'model:local', 'model:gemini', 'model:inception', 'model:xai',
  ],
  admin: [
    'read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws',
    'execute:task', 'execute:learning', 'execute:memory', 'execute:think',
    'execute:governance', 'execute:github', 'execute:terminal', 'execute:fs',
    'execute:shell', 'execute:aws', 'admin:agents',
    'model:local', 'model:gemini', 'model:inception', 'model:xai',
  ],
};

// allowedIntegrations → capabilities (from company-manifest.json).
export const INTEGRATION_CAPABILITIES: Record<string, Capability[]> = {
  github: ['read:github', 'execute:github'],
  neon: ['read:state', 'execute:memory'],
  'upstash-redis-mcp': ['read:metrics', 'execute:memory'],
  'upstash-box': ['execute:fs'],
};

// writeAuthority.level → capabilities.
export const WRITE_AUTHORITY_CAPABILITIES: Record<string, Capability[]> = {
  'repository-verification-only': ['execute:fs'],
  'orchestration-only': ['execute:task', 'execute:learning'],
  'internal-bus-only': ['execute:task'],
  'read-only': [],
};

export const REGISTRY_VERSION = '1.0.0';

// Capabilities currently ENFORCED (absence → 403). Everything else is
// observe-only in this phase. Only the highest-risk surfaces are enforced.
export const ENFORCED_CAPABILITIES: Capability[] = ['execute:terminal', 'execute:fs', 'execute:shell'];

export interface CapabilityContext {
  agentId: string | null;
  roles: string[];
  capabilities: Capability[];
  source: string[];
  version: string;
}

export function resolveCapabilities(opts: {
  agentId?: string | null;
  roles?: string[];
  allowedIntegrations?: string[];
  writeAuthorityLevel?: string;
}): CapabilityContext {
  const roles = opts.roles || [];
  const caps = new Set<Capability>();
  const source: string[] = [];

  for (const r of roles) {
    const base = ROLE_CAPABILITIES[r.toLowerCase()];
    if (base) {
      base.forEach((c) => caps.add(c));
      source.push(`role:${r}`);
    }
  }
  for (const int of opts.allowedIntegrations || []) {
    const c = INTEGRATION_CAPABILITIES[int];
    if (c) {
      c.forEach((x) => caps.add(x));
      source.push(`integration:${int}`);
    }
  }
  if (opts.writeAuthorityLevel) {
    const c = WRITE_AUTHORITY_CAPABILITIES[opts.writeAuthorityLevel];
    if (c) {
      c.forEach((x) => caps.add(x));
      source.push(`writeAuthority:${opts.writeAuthorityLevel}`);
    }
  }

  return {
    agentId: opts.agentId || null,
    roles,
    capabilities: [...caps],
    source,
    version: REGISTRY_VERSION,
  };
}

// Endpoint → required capability (for observability only — not enforced yet).
const ENDPOINT_CAPABILITY: Array<[RegExp, Capability]> = [
  [/^\/api\/terminal/, 'execute:terminal'],
  [/^\/api\/tools\/shell/, 'execute:shell'],
  [/^\/api\/tools\/fs/, 'execute:fs'],
  [/^\/api\/tools/, 'execute:fs'],
  [/^\/api\/learning/, 'execute:learning'],
  [/^\/api\/memory/, 'execute:memory'],
  [/^\/api\/think/, 'execute:think'],
  [/^\/api\/governance/, 'execute:governance'],
  [/^\/api\/agents/, 'admin:agents'],
  [/^\/api\/github/, 'read:github'],
  [/^\/api\/audit/, 'read:audit'],
  [/^\/api\/metrics/, 'read:metrics'],
  [/^\/api\/status/, 'read:state'],
  [/^\/api\/state/, 'read:state'],
  [/^\/api\/ops/, 'read:aws'],
  [/^\/api\/aws/, 'read:aws'],
];

export function endpointCapability(path: string): Capability | null {
  for (const [re, cap] of ENDPOINT_CAPABILITY) {
    if (re.test(path)) return cap;
  }
  return null;
}
