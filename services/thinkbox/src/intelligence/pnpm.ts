/**
 * pnpm dependency resolver.
 *
 * Detects pnpm-workspace.yaml and pnpm-lock.yaml, then reads package.json for
 * dependency lists. pnpm uses its own lockfile format.
 */

import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readJsonSafe(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function parseDeps(obj: unknown | undefined, cat: DependencyEntry['category']): DependencyEntry[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).map(([name, version]) => ({
    name, version: typeof version === 'string' ? version : null, category: cat,
  }));
}

export function resolvePnpm(files: string[], root: string): DependencyInfo | null {
  const hasPnpmLock = files.some(f => f === 'pnpm-lock.yaml');
  const hasPnpmWorkspace = files.some(f => f === 'pnpm-workspace.yaml');
  const hasPnpmRc = files.some(f => f === '.npmrc' || f === '.pnpmrc');

  if (!hasPnpmLock && !hasPnpmWorkspace && !hasPnpmRc) return null;

  const pkgJsonRel = files.find(f => f === 'package.json');
  if (!pkgJsonRel) return null;

  const pkgPath = join(root, pkgJsonRel);
  const json = readJsonSafe(pkgPath);
  if (!json) return null;

  const direct: DependencyEntry[] = [
    ...parseDeps(json.dependencies, 'dependency'),
    ...parseDeps(json.devDependencies, 'dev-dep'),
    ...parseDeps(json.peerDependencies, 'peer-dep'),
  ];

  let workspacePackages: string[] = [];

  if (hasPnpmWorkspace) {
    const wsPath = join(root, 'pnpm-workspace.yaml');
    const content = readTextSafe(wsPath);
    if (content) {
      const pkgs: string[] = [];
      for (const line of content.split('\n')) {
        const m = line.match(/-\s*["']?([^"'\n]+)["']?/);
        if (m && m[1] && !m[1].startsWith('#')) {
          pkgs.push(m[1].trim());
        }
      }
      if (pkgs.length > 0) workspacePackages = pkgs;
    }
  }

  if (workspacePackages.length === 0 && Array.isArray(json.workspaces)) {
    workspacePackages = json.workspaces as string[];
  }

  const totalCount = Object.keys(json.dependencies ?? {}).length +
    Object.keys(json.devDependencies ?? {}).length +
    Object.keys(json.peerDependencies ?? {}).length;

  return {
    manager: 'pnpm',
    lockfilePresent: hasPnpmLock,
    lockfilePath: hasPnpmLock ? 'pnpm-lock.yaml' : null,
    lockfileKind: 'pnpm-lock',
    packageManifestPath: pkgJsonRel,
    direct,
    transitiveCount: hasPnpmLock ? Math.max(0, totalCount * 2) : 0,
    totalCount,
    resolutionState: hasPnpmLock ? 'complete' : (totalCount > 0 ? 'partial' : 'none'),
    workspacePackages,
    workspaceCount: workspacePackages.length,
  };
}
