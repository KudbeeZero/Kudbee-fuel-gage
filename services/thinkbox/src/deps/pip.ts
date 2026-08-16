/**
 * deps/pip.ts
 *
 * Python package manager parser (pip, poetry).
 * Parses requirements.txt, pyproject.toml, or poetry.lock.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node:json5';

export interface PipResolution {
  direct: number;
  transitive: number;
  total: number;
  manager: 'pip' | 'poetry' | 'python';
  lockfileFormat: string;
}

/**
 * Parse Python dependencies.
 * Checks for poetry.lock first, then pyproject.toml, then requirements.txt.
 */
export async function parsePip(workspacePath: string): Promise<PipResolution | null> {
  // Try poetry.lock (most reliable)
  const poetryLockPath = join(workspacePath, 'poetry.lock');
  if (existsSync(poetryLockPath)) {
    return parsePoetry(poetryLockPath);
  }

  // Try pyproject.toml
  const pyprojectPath = join(workspacePath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    return parsePyproject(pyprojectPath);
  }

  // Try requirements.txt
  const requirementsPath = join(workspacePath, 'requirements.txt');
  if (existsSync(requirementsPath)) {
    return parseRequirements(requirementsPath);
  }

  return null;
}

async function parsePoetry(lockfilePath: string): Promise<PipResolution> {
  try {
    const content = readFileSync(lockfilePath, 'utf-8');

    // Count packages in poetry.lock
    // Poetry lockfile format: metadata -> name/version pairs
    let direct = 0;
    let transitive = 0;

    // Look for package metadata sections
    const packageMatches = content.match(/\[\[package\]\]/g);
    if (packageMatches) {
      const packagesSection = content.split(/\[\[package\]\]/);
      // First entry is metadata, rest are packages
      const packageCount = packagesSection.length - 1;
      transitive = packageCount; // All in lockfile are transitive
    }

    return {
      direct,
      transitive,
      total: direct + transitive,
      manager: 'poetry',
      lockfileFormat: 'poetry.lock',
    };
  } catch (error) {
    throw new Error(`Failed to parse poetry.lock: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function parsePyproject(pyprojectPath: string): Promise<PipResolution> {
  try {
    const content = readFileSync(pyprojectPath, 'utf-8');
    const config = parse(content);

    let direct = 0;
    const transitive = 0;

    // Extract dependencies from [tool.poetry.dependencies]
    const poetryDeps = config.tool?.poetry?.dependencies;
    if (poetryDeps) {
      direct = Object.keys(poetryDeps).length;
      // Subtract python version constraint if present
      if (direct > 0 && 'python' in poetryDeps) {
        direct--;
      }
    }

    return {
      direct,
      transitive,
      total: direct + transitive,
      manager: 'poetry',
      lockfileFormat: 'pyproject.toml',
    };
  } catch (error) {
    throw new Error(`Failed to parse pyproject.toml: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function parseRequirements(requirementsPath: string): Promise<PipResolution> {
  try {
    const content = readFileSync(requirementsPath, 'utf-8');
    const lines = content.split('\n');

    let direct = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments, empty lines, and editable installs
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-e')) {
        direct++;
      }
    }

    return {
      direct,
      transitive: 0,
      total: direct,
      manager: 'pip',
      lockfileFormat: 'requirements.txt',
    };
  } catch (error) {
    throw new Error(`Failed to parse requirements.txt: ${error instanceof Error ? error.message : String(error)}`);
  }
}