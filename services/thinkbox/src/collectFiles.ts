/**
 * Shared workspace file-walking utility.
 *
 * Single source of truth for the SKIP_DIRS list and the stack-based walker
 * used by detection, intelligence, and indexing engines. Keeps skip-dir
 * decisions consistent so confidence/language counts never drift between
 * manifest and index output.
 *
 * Symlinks are never traversed (lstat-based) — a workspace cannot pull in
 * files from outside its root via a symlinked directory.
 */

import { readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';

export const MAX_FILES = 50_000;

export const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.turbo', 'dist', 'build',
  'coverage', '.cache', '__pycache__', 'vendor', '.venv', 'venv',
  'target', '.idea', '.vscode',
]);

function isDirectory(p: string): boolean {
  try { return lstatSync(p).isDirectory(); } catch { return false; }
}

function isSymlink(p: string): boolean {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/**
 * Walk `root` and return relative paths of every non-symlinked file,
 * skipping known heavy/generated directories. Bounded by `maxFiles`.
 */
export function collectFiles(root: string, maxFiles: number = MAX_FILES): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      const fp = join(dir, e);
      const rp = relative(root, fp);
      if (isSymlink(fp)) continue; // never traverse symlinks (path-traversal guard)
      if (isDirectory(fp)) {
        if (!SKIP_DIRS.has(e)) stack.push(fp);
      } else {
        files.push(rp);
      }
    }
  }
  return files;
}
