/**
 * services/lib/capabilityRegistry.ts
 * ---------------------------------------------------------------------------
 * Phase 5B–5F — authoritative read-only capability resolver.
 *
 * Maps `agent identity → role → capabilities`. This is the single source of
 * truth for capability names. Enforcement is controlled by ENFORCED_CAPABILITIES.
 *
 * Governance is segmented (Phase 5F) so that read access, bounded operational
 * mutation, and security/policy administration are separate capabilities.
 * `execute:governance` NEVER implies `admin:governance`.
 *
 * This registry is NOT writable through any API route.
 * ---------------------------------------------------------------------------
 */

export type Capability = string;

// Role → base capability set.
export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  viewer: ['read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws', 'read:governance'],
  auditor: ['read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws', 'read:governance'],
  operator: [
    'read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws',
    'read:governance', 'execute:governance',
    'execute:task', 'execute:learning', 'execute:memory', 'execute:think',
    'execute:github', 'execute:dispatch',
    'model:local', 'model:gemini', 'model:inception', 'model:xai',
  ],
  admin: [
    'read:state', 'read:audit', 'read:metrics', 'read:github', 'read:aws',
    'read:governance', 'execute:governance', 'admin:governance',
    'execute:task', 'execute:learning', 'execute:memory', 'execute:think',
    'execute:github', 'execute:terminal', 'execute:fs', 'execute:shell',
    'execute:aws', 'admin:agents',
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
  'orchestration-only': ['execute:task', 'execute:learning', 'execute:governance'],
  'internal-bus-only': ['execute:task'],
  'read-only': [],
};

export const REGISTRY_VERSION = '1.2.0';

// Capabilities currently ENFORCED (absence → 403). Everything else is
// observe-only. High-risk surfaces (terminal/fs/shell), the segmented
// governance classes, and mint:think-token are enforced. REVIEW_REQUIRED
// routes stay observe-only.
export const ENFORCED_CAPABILITIES: Capability[] = [
  'execute:terminal', 'execute:fs', 'execute:shell',
  'read:governance', 'execute:governance', 'admin:governance',
  'mint:think-token',
  'ingest:telemetry',
  'execute:union', 'execute:contract', 'read:contract', 'execute:dispatch',
];

// Explicit per-agent capability grants (Phase 5J). mint:think-token is granted
// to gastown specifically — NOT inherited from execute:governance or
// admin:governance. Prefer explicit grants over implicit role inheritance.
// Phase 5L — ingest:telemetry is granted to the Edge Sentinel agent only.
export const AGENT_CAPABILITY_GRANTS: Record<string, Capability[]> = {
  gastown: ['mint:think-token'],
  sentinel: ['ingest:telemetry'],
  // Phase 5O — test-only principals for authorized-path verification (inert in
  // production; no real agent uses these IDs). union/contract are otherwise
  // default-deny with no legitimate runtime caller.
  'kudbee-union-verify': ['execute:union'],
  'kudbee-contract-verify': ['execute:contract', 'read:contract'],
  'kudbee-dispatch-verify': ['execute:dispatch'],
};

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
  // Explicit per-agent grants (e.g. gastown → mint:think-token).
  if (opts.agentId && AGENT_CAPABILITY_GRANTS[opts.agentId]) {
    AGENT_CAPABILITY_GRANTS[opts.agentId].forEach((x) => caps.add(x));
    source.push(`agentGrant:${opts.agentId}`);
  }

  return {
    agentId: opts.agentId || null,
    roles,
    capabilities: [...caps],
    source,
    version: REGISTRY_VERSION,
  };
}

// Governance route → capability class. REVIEW_REQUIRED = observe-only, not
// enforced, until explicitly classified.
function governanceCapability(method: string, path: string): Capability {
  const m = method.toUpperCase();
  // THINK-token minting — dedicated capability (Phase 5J).
  if (/\/mint-think-token$/.test(path)) return 'mint:think-token';
  // Read-only governance.
  if (m === 'GET') return 'read:governance';
  // Security/policy administration.
  if (/\/policies$/.test(path) || /\/tune\/apply$/.test(path)) return 'admin:governance';
  // Bounded operational mutation (non-policy).
  if (/\/feedback$/.test(path) || /\/tasks\/enqueue$/.test(path) || /\/failed\/retry$/.test(path) || /\/tune$/.test(path)) {
    return 'execute:governance';
  }
  // Phase 5O — classified governance authority surfaces (narrow capabilities).
  if (/\/union\/form$/.test(path) || /\/union\/negotiate$/.test(path)) return 'execute:union';
  if (/\/contract\/sign$/.test(path)) return 'execute:contract';
  if (/\/contract\/verify/.test(path)) return 'read:contract';
  if (/\/dispatch$/.test(path)) return 'execute:dispatch';
  // Unresolved high-impact operations — observe only until classified.
  return 'REVIEW_REQUIRED';
}

// Endpoint → required capability (method-aware). For observability/enforcement.
const ENDPOINT_CAPABILITY: Array<[RegExp, Capability]> = [
  [/^\/api\/telemetry\/edge-ingest$/, 'ingest:telemetry'],
  [/^\/api\/terminal/, 'execute:terminal'],
  [/^\/api\/tools\/shell/, 'execute:shell'],
  [/^\/api\/tools\/fs/, 'execute:fs'],
  [/^\/api\/tools/, 'execute:fs'],
  [/^\/api\/learning/, 'execute:learning'],
  [/^\/api\/memory/, 'execute:memory'],
  [/^\/api\/think/, 'execute:think'],
  [/^\/api\/agents/, 'admin:agents'],
  [/^\/api\/github/, 'read:github'],
  [/^\/api\/audit/, 'read:audit'],
  [/^\/api\/metrics/, 'read:metrics'],
  [/^\/api\/status/, 'read:state'],
  [/^\/api\/state/, 'read:state'],
  [/^\/api\/ops/, 'read:aws'],
  [/^\/api\/aws/, 'read:aws'],
];

export function endpointCapability(method: string, path: string): Capability | null {
  if (path.startsWith('/api/governance')) return governanceCapability(method, path);
  for (const [re, cap] of ENDPOINT_CAPABILITY) {
    if (re.test(path)) return cap;
  }
  return null;
}
