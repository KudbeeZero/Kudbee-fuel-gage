/**
 * deps/npm.ts
 *
 * NPM/Bun package manager parser (compatible with package-lock.json and bun.lock).
 * Parses lockfiles WITHOUT installing dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node:json5';

export interface NpmResolution {
  direct: number;
  transitive: number;
  total: number;
  manager: 'npm' | 'bun';
  lockfileFormat: string;
}

/**
 * Parse NPM package-lock.json or Bun bun.lock.
 */
export function parseNpm(workspacePath: string): Promise<NpmResolution | null> {
  return parseLockfile(workspacePath, 'npm', [
    'package-lock.json',
    'bun.lock',
    'bun.lockb',
  ]);
}

/**
 * Parse Bun bun.lock specifically.
 */
export function parseBun(workspacePath: string): Promise<NpmResolution | null> {
  return parseLockfile(workspacePath, 'bun', [
    'bun.lock',
    'bun.lockb',
  ]);
}

async function parseLockfile(
  workspacePath: string,
  manager: 'npm' | 'bun',
  lockfileNames: string[]
): Promise<NpmResolution | null> {
  // Find the lockfile
  let lockfilePath: string | null = null;
  for (const name of lockfileNames) {
    const path = join(workspacePath, name);
    if (existsSync(path)) {
      lockfilePath = path;
      break;
    }
  }

  if (!lockfilePath) {
    return null;
  }

  try {
    const content = readFileSync(lockfilePath, 'utf-8');
    const lockfile = parse(content);

    // Count dependencies
    let direct = 0;
    let transitive = 0;

    if (lockfile.packages) {
      // package-lock.json v2+ format
      for (const [key, value] of Object.entries(lockfile.packages)) {
        if (key === '') {
          // Root package
          direct += Array.isArray((value as Record<string, unknown>).dependencies)
            ? (value as Record<string, unknown>).dependencies?.length || 0
            : 0;
        } else {
          // Transitive dependency
          transitive++;
        }
      }
    } else if (lockfile.dependencies) {
      // Older format
      direct = Object.keys(lockfile.dependencies).length;
      // Count all nested dependencies recursively (simplified)
      transitive = countNestedDependencies(lockfile.dependencies);
    }

    // Determine lockfile format
    const lockfileName = lockfilePath.split('/').pop() || '';
    let lockfileFormat = 'package-lock';
    if (lockfileName.startsWith('bun')) {
      lockfileFormat = 'bun.lock';
    } else if (lockfileName.includes('lock')) {
      lockfileFormat = 'package-lock';
    }

    return {
      direct,
      transitive,
      total: direct + transitive,
      manager,
      lockfileFormat,
    };
  } catch (error) {
    throw new Error(`Failed to parse ${lockfilePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function countNestedDependencies(dependencies: Record<string, unknown>): number {
  let count = 0;
  for (const value of Object.values(dependencies)) {
    if (value && typeof value === 'object') {
      const dep = value as Record<string, unknown>;
      if (dep.dependencies) {
        count += Object.keys(dep.dependencies).length;
        count += countNestedDependencies(dep.dependencies as Record<string, unknown>);
      }
    }
  }
  return count;
}