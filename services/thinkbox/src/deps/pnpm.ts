/**
 * deps/pnpm.ts
 *
 * PNPM package manager parser.
 * Parses pnpm-lock.yaml without installing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PnpmResolution {
  direct: number;
  transitive: number;
  total: number;
  manager: 'pnpm';
  lockfileFormat: string;
}

/**
 * Parse pnpm-lock.yaml.
 */
export async function parsePnpm(workspacePath: string): Promise<PnpmResolution | null> {
  const lockfilePath = join(workspacePath, 'pnpm-lock.yaml');

  if (!existsSync(lockfilePath)) {
    return null;
  }

  try {
    const content = readFileSync(lockfilePath, 'utf-8');

    // Simple YAML parsing for key sections
    // PNPM lockfile structure is complex; we count dependencies at root
    let direct = 0;
    let transitive = 0;

    // Look for imports, dependencies, devDependencies
    const importMatch = content.match(/importers:\s*\n\s*- \.\./g);
    if (importMatch) {
      // Monorepo structure - count root dependencies
      direct = importMatch.length;
    }

    // Look for packages section
    const packagesMatch = content.match(/packages:\s*\n([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);
    if (packagesMatch) {
      // Count entries in packages (transitive dependencies)
      const packagesSection = packagesMatch[1];
      const packageMatches = packagesSection.matchAll(/^\s{2}(\S+)/gm);
      for (const _ of packageMatches) {
        transitive++;
      }
    }

    return {
      direct,
      transitive,
      total: direct + transitive,
      manager: 'pnpm',
      lockfileFormat: 'pnpm-lock.yaml',
    };
  } catch (error) {
    throw new Error(`Failed to parse pnpm-lock.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
}