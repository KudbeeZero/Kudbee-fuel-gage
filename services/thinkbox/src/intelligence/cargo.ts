/**
 * Rust/Cargo dependency resolver.
 *
 * Parses Cargo.toml for dependencies and detects Cargo.lock presence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DependencyInfo, DependencyEntry } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function parseCargoDeps(content: string, section: string): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  const sectionPattern = new RegExp(`\\[${section}\\]`, 'i');
  const match = content.match(sectionPattern);
  if (!match) return entries;

  const start = match.index! + match[0].length;
  const rest = content.substring(start);
  const nextSection = rest.indexOf('\n[');
  const sectionContent = nextSection === -1 ? rest : rest.substring(0, nextSection);

  for (const line of sectionContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const name = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim().replace(/["']/g, '');

    let version: string | null = null;
    if (value && !value.startsWith('{') && !value.startsWith('[')) {
      version = value.split(',')[0].trim();
    } else {
      const verMatch = value.match(/version\s*=\s*["']([^"']+)["']/);
      if (verMatch) version = verMatch[1];
    }

    if (name) {
      entries.push({ name, version, category: 'dependency' });
    }
  }
  return entries;
}

export function resolveCargo(files: string[], root: string): DependencyInfo | null {
  const cargoToml = files.find(f => f === 'Cargo.toml');
  if (!cargoToml) return null;

  const content = readTextSafe(join(root, cargoToml));
  if (!content) return null;

  const hasCargoLock = files.some(f => f === 'Cargo.lock');
  const hasWorkspace = content.includes('[workspace');

  const direct: DependencyEntry[] = [
    ...parseCargoDeps(content, 'dependencies'),
    ...parseCargoDeps(content, 'dev-dependencies'),
    ...parseCargoDeps(content, 'build-dependencies'),
  ];

  const wsPkgs: string[] = [];
  if (hasWorkspace) {
    const wsMatch = content.match(/members\s*=\s*\[([^\]]+)\]/);
    if (wsMatch) {
      for (const m of wsMatch[1].split(',')) {
        wsPkgs.push(m.trim().replace(/["']/g, ''));
      }
    }
  }

  return {
    manager: 'cargo',
    lockfilePresent: hasCargoLock,
    lockfilePath: hasCargoLock ? 'Cargo.lock' : null,
    lockfileKind: 'cargo-lock',
    packageManifestPath: cargoToml,
    direct,
    transitiveCount: hasCargoLock ? Math.max(0, direct.length * 2) : 0,
    totalCount: direct.length,
    resolutionState: hasCargoLock ? 'complete' : (direct.length > 0 ? 'partial' : 'none'),
    workspacePackages: wsPkgs,
    workspaceCount: wsPkgs.length,
  };
}
