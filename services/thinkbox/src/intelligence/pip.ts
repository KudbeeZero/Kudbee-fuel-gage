/**
 * Python dependency resolver.
 *
 * Handles requirements.txt, pyproject.toml (poetry/pdm/setuptools), and poetry.lock.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function parseRequirements(content: string): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-') ||
        trimmed.startsWith('--') || trimmed.startsWith('git+')) continue;
    const eqIdx = trimmed.indexOf('==');
    const gtIdx = trimmed.indexOf('>=');
    const tildeIdx = trimmed.indexOf('~=');
    const semicolonIdx = trimmed.indexOf(';');

    let nameEnd = trimmed.length;
    for (const idx of [eqIdx, gtIdx, tildeIdx, semicolonIdx]) {
      if (idx !== -1 && idx < nameEnd) nameEnd = idx;
    }

    const name = trimmed.substring(0, nameEnd).trim();
    const version = eqIdx !== -1
      ? trimmed.substring(eqIdx + 2).split(';')[0].trim()
      : null;

    if (name) entries.push({ name, version, category: 'dependency' });
  }
  return entries;
}

function parsePyprojectDeps(content: string, section: string): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  const inSection = new RegExp(`\\[${section}\\]`, 'i');
  const sectionMatch = content.match(inSection);
  if (!sectionMatch) return entries;

  const startIdx = sectionMatch.index! + sectionMatch[0].length;
  const rest = content.substring(startIdx);
  const nextSection = rest.indexOf('\n[');
  const sectionContent = nextSection === -1 ? rest : rest.substring(0, nextSection);

  for (const line of sectionContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const name = trimmed.substring(0, eqIdx).trim();
    let version: string | null = null;

    const verMatch = trimmed.match(/["']([^"']+)["']/);
    if (verMatch) version = verMatch[1];
    else {
      const braceMatch = trimmed.match(/\{version\s*=\s*["']([^"']+)["']/);
      if (braceMatch) version = braceMatch[1];
    }

    if (name && !name.startsWith('#')) {
      entries.push({
        name,
        version,
        category: section === 'tool.poetry.dependencies' ? 'dependency' : 'dev-dep',
      });
    }
  }
  return entries;
}

export function resolvePip(files: string[], root: string): DependencyInfo | null {
  const hasReqTxt = files.some(f => f === 'requirements.txt');
  const hasPyproject = files.some(f => f === 'pyproject.toml');
  const hasPoetryLock = files.some(f => f === 'poetry.lock');
  const hasPipfileLock = files.some(f => f === 'Pipfile.lock');
  const hasSetupPy = files.some(f => f === 'setup.py');

  const pySignal = hasReqTxt || hasPyproject || hasPoetryLock || hasPipfileLock || hasSetupPy;
  if (!pySignal) return null;

  const direct: DependencyEntry[] = [];
  let hasLockfile = false;
  let lockfilePath: string | null = null;
  let lockfileKind: string | null = null;
  let manager: DependencyInfo['manager'] = 'pip';
  let manifestPath = 'requirements.txt';

  if (hasPoetryLock) {
    hasLockfile = true;
    lockfilePath = 'poetry.lock';
    lockfileKind = 'poetry-lock';
    manager = 'poetry';
  } else if (hasPipfileLock) {
    hasLockfile = true;
    lockfilePath = 'Pipfile.lock';
    lockfileKind = 'pipfile-lock';
    manager = 'pip';
  }

  if (hasReqTxt) {
    const content = readTextSafe(join(root, 'requirements.txt'));
    if (content) {
      direct.push(...parseRequirements(content));
      manifestPath = 'requirements.txt';
    }
  }

  if (hasPyproject) {
    const content = readTextSafe(join(root, 'pyproject.toml'));
    if (content) {
      direct.push(...parsePyprojectDeps(content, 'tool.poetry.dependencies'));
      direct.push(...parsePyprojectDeps(content, 'tool.poetry.group.dev.dependencies'));
      direct.push(...parsePyprojectDeps(content, 'tool.poetry.dev-dependencies'));
      manifestPath = 'pyproject.toml';
    }
  }

  if (direct.length === 0 && hasSetupPy) {
    manifestPath = 'setup.py';
    direct.push({ name: 'python', version: null, category: 'dependency' });
  }

  const resolutionState = hasLockfile ? 'complete' : (direct.length > 0 ? 'partial' : 'none');

  return {
    manager,
    lockfilePresent: hasLockfile,
    lockfilePath,
    lockfileKind,
    packageManifestPath: manifestPath,
    direct,
    transitiveCount: hasLockfile ? Math.max(0, direct.length * 2) : 0,
    totalCount: direct.length,
    resolutionState,
    workspacePackages: [],
    workspaceCount: 0,
  };
}
