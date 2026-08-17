/**
 * deps/resolver.ts
 *
 * Dependency Resolution Engine — orchestrates per-manager dispatch.
 * Given a DetectionResult from PR-001, resolves the dependency graph
 * for all package managers detected in the workspace.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectionResult } from '../detection/index.js';
import type { DependencyManifest } from './manifest.js';
import { parseNpm } from './npm.js';
import { parseBun } from './bun.js';
import { parsePnpm } from './pnpm.js';
import { parsePip } from './pip.js';
import { parseCargo } from './cargo.js';
import { parseGo } from './go.js';
import { buildManifest } from './manifest.js';

export interface ResolutionResult {
  workspaceId: string;
  manifest: DependencyManifest;
  errors: string[];
  timestamp: Date;
}

/**
 * Resolve dependencies for a workspace.
 *
 * @param workspacePath - Absolute path to workspace root
 * @param detection - Result from PR-001 detection
 * @returns ResolutionResult with manifest and any parsing errors
 */
export async function resolveDependencies(
  workspacePath: string,
  detection: DetectionResult
): Promise<ResolutionResult> {
  const errors: string[] = [];
  const managers = detection.packageManagers || [];
  const counts = {
    direct: 0,
    transitive: 0,
    total: 0,
  };

  // Parse each detected package manager
  for (const manager of managers) {
    try {
      const result = await parseManager(manager, workspacePath);
      if (result) {
        counts.direct += result.direct;
        counts.transitive += result.transitive;
        counts.total += result.total;
      }
    } catch (error) {
      errors.push(`${manager}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Build normalized manifest
  const manifest = buildManifest(
    detection.workspaceId,
    detection.workspacePath,
    managers,
    counts
  );

  return {
    workspaceId: detection.workspaceId,
    manifest,
    errors,
    timestamp: new Date(),
  };
}

/**
 * Dispatch to the appropriate parser for a package manager.
 */
async function parseManager(
  manager: string,
  workspacePath: string
): Promise<{ direct: number; transitive: number; total: number } | null> {
  switch (manager.toLowerCase()) {
    case 'npm':
    case 'node':
      return parseNpm(workspacePath);

    case 'bun':
      return parseBun(workspacePath);

    case 'pnpm':
      return parsePnpm(workspacePath);

    case 'pip':
    case 'poetry':
    case 'python':
      return parsePip(workspacePath);

    case 'cargo':
    case 'rust':
      return parseCargo(workspacePath);

    case 'go':
      return parseGo(workspacePath);

    default:
      return null;
  }
}

/**
 * Check if a lockfile exists for a given package manager.
 */
export function hasLockfile(manager: string, workspacePath: string): boolean {
  const lockfiles: Record<string, string[]> = {
    npm: ['package-lock.json'],
    bun: ['bun.lock', 'bun.lockb'],
    pnpm: ['pnpm-lock.yaml'],
    pip: ['requirements.txt', 'pyproject.toml', 'poetry.lock'],
    cargo: ['Cargo.toml', 'Cargo.lock'],
    go: ['go.mod', 'go.sum'],
  };

  const patterns = lockfiles[manager.toLowerCase()] || [];
  return patterns.some((lockfile) => existsSync(join(workspacePath, lockfile)));
}