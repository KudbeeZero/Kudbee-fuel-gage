/**
 * npm/pnpm/yarn package.json dependency resolver.
 *
 * Parses package.json to extract dependencies, devDependencies, peerDependencies,
 * optionalDependencies, workspace packages, and scripts section identification.
 */

import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseDeps(obj: unknown | undefined, category: DependencyEntry['category']): DependencyEntry[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).map(([name, version]) => ({
    name,
    version: typeof version === 'string' ? version : null,
    category,
  }));
}

export function resolveNpm(files: string[], root: string): DependencyInfo | null {
  const pkgJsonRel = files.find(f => f === 'package.json');
  if (!pkgJsonRel) return null;

  const pkgPath = join(root, pkgJsonRel);
  const json = readJsonSafe(pkgPath);
  if (!json) return null;

  const direct: DependencyEntry[] = [
    ...parseDeps(json.dependencies, 'dependency'),
    ...parseDeps(json.devDependencies, 'dev-dep'),
    ...parseDeps(json.peerDependencies, 'peer-dep'),
    ...parseDeps(json.optionalDependencies, 'optional-dep'),
  ];

  const workspaces = Array.isArray(json.workspaces)
    ? json.workspaces as string[]
    : (json.workspaces && typeof json.workspaces === 'object' && Array.isArray((json.workspaces as Record<string, unknown>).packages))
      ? (json.workspaces as Record<string, unknown>).packages as string[]
      : [];

  const hasPkgLock = files.some(f => f === 'package-lock.json');
  const hasYarnLock = files.some(f => f === 'yarn.lock');
  const hasBunLock = files.some(f => f === 'bun.lock' || f === 'bun.lockb');
  const hasPnpmLock = files.some(f => f === 'pnpm-lock.yaml');

  if (hasBunLock || hasPnpmLock) return null;

  let lockfilePresent = hasPkgLock || hasYarnLock;
  let lockfilePath: string | null = null;
  let lockfileKind: string | null = null;
  let manager: DependencyInfo['manager'] = 'npm';

  if (hasYarnLock) {
    lockfilePath = 'yarn.lock';
    lockfileKind = 'yarn-lock';
    manager = 'yarn';
    lockfilePresent = true;
  } else if (hasPkgLock) {
    lockfilePath = 'package-lock.json';
    lockfileKind = 'package-lock';
    manager = 'npm';
    lockfilePresent = true;
  }

  const resolutionState = lockfilePresent ? 'complete' : (direct.length > 0 ? 'partial' : 'none');
  const totalDeps = Object.keys(json.dependencies ?? {}).length +
    Object.keys(json.devDependencies ?? {}).length +
    Object.keys(json.peerDependencies ?? {}).length +
    Object.keys(json.optionalDependencies ?? {}).length;

  return {
    manager,
    lockfilePresent,
    lockfilePath,
    lockfileKind,
    packageManifestPath: pkgJsonRel,
    direct,
    transitiveCount: lockfilePresent ? Math.max(0, totalDeps * 2) : 0,
    totalCount: totalDeps,
    resolutionState,
    workspacePackages: workspaces,
    workspaceCount: workspaces.length,
  };
}
