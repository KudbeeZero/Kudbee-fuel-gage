/**
 * Go module dependency resolver.
 *
 * Parses go.mod for module name, go version, require directives, and
 * detects go.sum presence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

export function resolveGo(files: string[], root: string): DependencyInfo | null {
  const goMod = files.find(f => f === 'go.mod');
  if (!goMod) return null;

  const content = readTextSafe(join(root, goMod));
  if (!content) return null;

  const hasGoSum = files.some(f => f === 'go.sum');

  const direct: DependencyEntry[] = [];
  const lines = content.split('\n');

  let inRequire = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('require (')) {
      inRequire = true;
      continue;
    }
    if (trimmed === ')' && inRequire) {
      inRequire = false;
      continue;
    }

    if (inRequire) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && parts[0] && !trimmed.startsWith('//')) {
        direct.push({
          name: parts[0],
          version: parts[1],
          category: 'dependency',
        });
      }
    } else if (trimmed.startsWith('require ')) {
      const parts = trimmed.replace('require ', '').trim().split(/\s+/);
      if (parts.length >= 2) {
        direct.push({
          name: parts[0],
          version: parts[1],
          category: 'dependency',
        });
      }
    }
  }

  return {
    manager: 'go-modules',
    lockfilePresent: hasGoSum,
    lockfilePath: hasGoSum ? 'go.sum' : null,
    lockfileKind: 'go.sum',
    packageManifestPath: goMod,
    direct,
    transitiveCount: hasGoSum ? Math.max(0, direct.length * 3) : 0,
    totalCount: direct.length,
    resolutionState: hasGoSum ? 'complete' : (direct.length > 0 ? 'partial' : 'none'),
    workspacePackages: [],
    workspaceCount: 0,
  };
}
