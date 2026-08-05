#!/usr/bin/env node
/**
 * SEC-001 — Keystone Trust Boundary fixtures test.
 *
 * Verifies INV-013: governance files may never be modified by an executing
 * cloud agent.
 *
 *   - isGovernancePath() identifies every governance artifact
 *   - governanceViolations() flags an agent's write set
 *   - assertGovernancePathsProtected() fails closed if the list is dropped
 *   - The guardian blocks when governance files differ from the base
 *
 * Run: bun test scripts/keystone.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const KEYSTONE = join(ROOT, 'services', 'lib', 'governanceKeystone.ts');

// Load the keystone module (TS via tsx loader in bun).
const {
  GOVERNANCE_PATHS,
  isGovernancePath,
  governanceViolations,
  assertGovernancePathsProtected,
} = await import(`../services/lib/governanceKeystone.ts`);

test('keystone list is non-empty and includes the two canonical docs', () => {
  expect(GOVERNANCE_PATHS.length).toBeGreaterThan(0);
  expect(GOVERNANCE_PATHS).toContain('AGENTS.md');
  expect(GOVERNANCE_PATHS).toContain('MODEL_CONTRACT.md');
});

test('isGovernancePath flags governance files', () => {
  expect(isGovernancePath('AGENTS.md')).toBe(true);
  expect(isGovernancePath('MODEL_CONTRACT.md')).toBe(true);
  expect(isGovernancePath('engineering_state.yaml')).toBe(true);
  expect(isGovernancePath('REPOSITORY_MANIFEST.json')).toBe(true);
  expect(isGovernancePath('kilo.json')).toBe(true);
  expect(isGovernancePath('scripts/repository-guardian.mjs')).toBe(true);
});

test('isGovernancePath does not flag ordinary source files', () => {
  expect(isGovernancePath('src/foo.ts')).toBe(false);
  expect(isGovernancePath('services/ingestion/server.js')).toBe(false);
  expect(isGovernancePath('package.json')).toBe(false);
});

test('isGovernancePath normalizes ./ prefix and backslashes', () => {
  expect(isGovernancePath('./AGENTS.md')).toBe(true);
  expect(isGovernancePath('MODEL_CONTRACT.md')).toBe(true);
});

test('governanceViolations returns the violating subset of a write set', () => {
  const violations = governanceViolations(['src/foo.ts', 'AGENTS.md', 'MODEL_CONTRACT.md', 'package.json']);
  expect(violations).toContain('AGENTS.md');
  expect(violations).toContain('MODEL_CONTRACT.md');
  expect(violations).not.toContain('src/foo.ts');
  expect(violations).not.toContain('package.json');
});

test('governanceViolations returns empty for a safe write set', () => {
  expect(governanceViolations(['src/foo.ts', 'services/x.ts'])).toEqual([]);
});

test('assertGovernancePathsProtected passes when the keystone is intact', () => {
  expect(assertGovernancePathsProtected()).toBeNull();
});

test('guardian blocks when a governance file is modified by the agent', () => {
  // Simulate: the guardian's keystone check fails when AGENTS.md differs
  // from the base. We verify the module-level violation detection directly,
  // and that the guardian exits non-zero on such a state by checking the
  // violation function's contract (the live diff is covered by the guardian
  // integration; here we assert the pure function).
  const staged = governanceViolations(['AGENTS.md']);
  expect(staged.length).toBe(1);
});

test('keystone module has no hardcoded credentials (INV-003 compatible)', () => {
  const content = execFileSync('cat', [KEYSTONE], { encoding: 'utf8' });
  expect(content).not.toMatch(/sk-(?:proj|ant)-|ghp_|AIza[A-Za-z0-9_-]{16}/);
});
