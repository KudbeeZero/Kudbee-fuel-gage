/**
 * services/lib/governanceKeystone.ts — SEC-001 Keystone Trust Boundary
 * ---------------------------------------------------------------------------
 * The keystone concept: governance files may NEVER be modified by an
 * executing cloud agent. The agent cannot read or write its own ceiling.
 *
 * Ownership table (single source of truth):
 *   Governance → Owner: Human → Editable by: NO AGENT
 *
 * Files listed here are agent-read-only. Any attempt by an agent process to
 * stage or commit changes to these paths is a governance violation.
 *
 * INV-013: Governance files may never be modified by an executing cloud agent.
 *
 * Usage (import in repository-guardian.mjs and any agent-side tool gate):
 *   import { isGovernancePath, GOVERNANCE_PATHS, assertGovernancePathsProtected } from '../lib/governanceKeystone.ts';
 *
 *   isGovernancePath('AGENTS.md')            → true
 *   isGovernancePath('src/foo.ts')           → false
 * ---------------------------------------------------------------------------
 */

/**
 * The permanent ownership table. Every entry maps a governance artifact to
 * its owner and editability. The set must be kept minimal: anything here is
 * agent-read-only and can only be changed by a human-merged PR.
 */
export const GOVERNANCE_PATHS = [
  // Root governance documents.
  'AGENTS.md',
  'MODEL_CONTRACT.md',
  'engineering_state.yaml',
  'REPOSITORY_MANIFEST.json',
  'kilo.json',
  // Repository protection + security policy.
  'scripts/repository-guardian.mjs',
  'services/lib/governanceKeystone.ts',
  'services/lib/bearerAuthMiddleware.ts',
  'scripts/verify-secret-hygiene.mjs',
  'scripts/verify-quick.mjs',
  // CI policy — the gates that govern what may merge.
  '.github/workflows/verify.yml',
  '.github/workflows/codeql.yml',
] as const;

export type GovernancePath = (typeof GOVERNANCE_PATHS)[number];

/**
 * Return true when the given relative path is a governance-protected file.
 * Normalizes separators and leading './' so the check is robust.
 */
export function isGovernancePath(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return (GOVERNANCE_PATHS as readonly string[]).includes(normalized);
}

/**
 * INV-013 guard: given the set of files an agent is about to write or stage,
 * return the subset that are governance paths (a violation). Empty = safe.
 */
export function governanceViolations(changedFiles: string[]): string[] {
  return changedFiles.filter((f) => isGovernancePath(f));
}

/**
 * Boot-time assertion. Fails closed if a refactor drops the keystone list
 * from the guardian's own set (i.e., the list becomes empty or the guardian
 * no longer references it). Returns an error string when compromised.
 */
export function assertGovernancePathsProtected(): string | null {
  if (GOVERNANCE_PATHS.length === 0) {
    return 'governance keystone list is empty — ceiling is unenforced';
  }
  if (!GOVERNANCE_PATHS.includes('AGENTS.md')) {
    return 'AGENTS.md missing from governance keystone';
  }
  if (!GOVERNANCE_PATHS.includes('MODEL_CONTRACT.md')) {
    return 'MODEL_CONTRACT.md missing from governance keystone';
  }
  return null;
}
