/**
 * bun dependency resolver.
 *
 * Covers bun.lock (text) and bun.lockb (binary) presence detection. For bun-specific
 * project configuration, reads from package.json (which bun also uses).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readJsonSafe(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function parseDeps(obj: unknown | undefined, cat: DependencyEntry['category']): DependencyEntry[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).map(([name, version]) => ({
    name, version: typeof version === 'string' ? version : null, category: cat,
  }));
}

export function resolveBun(files: string[], root: string): DependencyInfo | null {
  const pkgJsonRel = files.find(f => f === 'package.json');
  if (!pkgJsonRel) return null;

  const hasBunLock = files.some(f => f === 'bun.lock' || f === 'bun.lockb');
  const hasBunfig = files.some(f => f === 'bunfig.toml');

  const pkgPath = join(root, pkgJsonRel);
  const json = readJsonSafe(pkgPath);
  if (!json) return null;

  const hasBunDeps = Array.isArray(json.bunDependencies) ||
    (typeof json.bunDependencies === 'object' && json.bunDependencies !== null);

  if (!hasBunLock && !hasBunfig && !hasBunDeps) return null;

  const direct: DependencyEntry[] = [
    ...parseDeps(json.dependencies, 'dependency'),
    ...parseDeps(json.devDependencies, 'dev-dep'),
    ...parseDeps(json.peerDependencies, 'peer-dep'),
  ];

  const lockfilePath = hasBunLock
    ? (files.find(f => f === 'bun.lock') ?? files.find(f => f === 'bun.lockb') ?? 'bun.lock')
    : null;

  const totalCount = Object.keys(json.dependencies ?? {}).length +
    Object.keys(json.devDependencies ?? {}).length +
    Object.keys(json.peerDependencies ?? {}).length;

  const workspacePkgs = Array.isArray(json.workspaces) ? json.workspaces as string[] : [];

  return {
    manager: 'bun',
    lockfilePresent: hasBunLock,
    lockfilePath,
    lockfileKind: hasBunLock ? 'bun.lock' : null,
    packageManifestPath: pkgJsonRel,
    direct,
    transitiveCount: hasBunLock ? Math.max(0, totalCount * 2) : 0,
    totalCount,
    resolutionState: hasBunLock ? 'complete' : (totalCount > 0 ? 'partial' : 'none'),
    workspacePackages: workspacePkgs,
    workspaceCount: workspacePkgs.length,
  };
}
