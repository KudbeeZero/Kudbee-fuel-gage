/**
 * services/thinkbox/src/importer.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Universal Import Layer.
 *
 * One interface in front of all ingress types. Every source (git URL, ZIP
 * archive, local directory) is normalized into the same internal
 * representation: a directory on disk that the Detection Engine can scan.
 *
 * Responsibilities:
 *   - Accept git / zip / directory inputs.
 *   - Materialize the source into a normalized import directory.
 *   - Return the import path + a source descriptor for the registry.
 *
 * Non-goals:
 *   - Detection, dependency installation, or execution.
 *
 * Standards: fully typed, no dead code, no implicit any, ESM-only imports.
 * ---------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SourceType } from './registry.ts';

export interface ImportDescriptor {
  /** Normalized on-disk path of the imported project. */
  importPath: string;
  /** Ingress type that produced this import. */
  sourceType: SourceType;
  /** Original source location as given by the caller. */
  sourceLocation: string;
  /** A stable name derived from the source (used as workspace name). */
  name: string;
}

/** Derive a safe, stable name from any source reference. */
function safeName(input: string): string {
  const base = input.split(/[\/\\]/).filter(Boolean).pop() ?? input;
  return (
    base
      .replace(/\.git$/i, '')
      .replace(/\.(zip|tar|gz)$/i, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'workspace'
  );
}

function ensureEmpty(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function looksLikeGitUrl(input: string): boolean {
  return /^(https?|git|ssh):\/\/|^git@|\.git(\/|$)/.test(input.trim());
}

function freshImportDir(): string {
  return join(tmpdir(), `thinkbox-${randomUUID()}`);
}

/** Import a git repository (shallow clone) into a fresh temp directory. */
function importGit(url: string): ImportDescriptor {
  const importPath = freshImportDir();
  ensureEmpty(importPath);
  execFileSync('git', ['clone', '--depth', '1', '--quiet', url, importPath], { stdio: 'pipe' });
  return { importPath, sourceType: 'git', sourceLocation: url, name: safeName(url) };
}

/** Import a local directory by copying it into a fresh temp directory. */
function importDirectory(path: string): ImportDescriptor {
  const importPath = freshImportDir();
  ensureEmpty(importPath);
  cpSync(path, importPath, { recursive: true });
  return { importPath, sourceType: 'directory', sourceLocation: path, name: safeName(path) };
}

/**
 * Import a ZIP archive. Requires the system `unzip` binary (available on
 * common runners). A `__MACOSX` artifact directory is removed. When the
 * archive wraps a single top-level directory (the GitHub "Download ZIP"
 * shape), that directory becomes the project root.
 */
function importZip(zipPath: string): ImportDescriptor {
  if (!existsSync(zipPath)) throw new Error(`ZIP not found: ${zipPath}`);

  const extractPath = freshImportDir();
  ensureEmpty(extractPath);
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', extractPath], { stdio: 'pipe' });

  rmSync(join(extractPath, '__MACOSX'), { recursive: true, force: true });

  const entries = readdirSync(extractPath).filter((e) => !e.startsWith('.'));
  const topLevelDirs = entries.filter((e) => statSync(join(extractPath, e)).isDirectory());

  const projectRoot =
    topLevelDirs.length === 1 && entries.length === 1 ? join(extractPath, topLevelDirs[0] as string) : extractPath;

  return {
    importPath: projectRoot,
    sourceType: 'zip',
    sourceLocation: zipPath,
    name: safeName(zipPath),
  };
}

/**
 * Normalize any supported input into an ImportDescriptor.
 *
 * @param input a git URL, an existing local directory path, or a .zip archive path.
 * @throws when the input cannot be resolved to a supported source type.
 */
export function importSource(input: string): ImportDescriptor {
  const trimmed = input.trim();

  if (looksLikeGitUrl(trimmed)) return importGit(trimmed);

  if (existsSync(trimmed)) {
    if (/\.(zip)$/i.test(trimmed)) return importZip(trimmed);
    return importDirectory(trimmed);
  }

  // Not a local path and not a URL — accept owner/repo shorthand.
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed) || trimmed.includes('github.com')) {
    return importGit(trimmed);
  }

  throw new Error(
    `Unsupported or unresolvable input: "${input}". Provide a git URL, an existing directory path, or a .zip archive path.`
  );
}

/** Resolve the source type for a given input without materializing it. */
export function resolveSourceType(input: string): SourceType {
  const trimmed = input.trim();
  if (looksLikeGitUrl(trimmed)) return 'git';
  if (/\.(zip)$/i.test(trimmed) && existsSync(trimmed)) return 'zip';
  if (existsSync(trimmed)) return 'directory';
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed) || trimmed.includes('github.com')) return 'git';
  throw new Error(`Unsupported or unresolvable input: "${input}"`);
}
