/**
 * THINKBOX PR-004 — Code Indexing Engine
 *
 * Orchestrator: walks a project directory, detects languages, dispatches to
 * language-specific indexers, and produces a normalized CodeIndex.
 * Deterministic — same input → same output.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import type { CodeIndex, IndexingOptions } from './types.ts';
import { indexTypeScriptFiles } from './typescript.ts';
import { indexPythonFiles } from './python.ts';
import type { Workspace } from '../registry.ts';

const MAX_FILES = 50_000;
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.turbo', 'dist', 'build',
  'coverage', '.cache', '__pycache__', 'vendor', '.venv', 'venv',
  'target', '.idea', '.vscode',
]);

function isDirectory(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function collectFiles(root: string, options: IndexingOptions = {}): string[] {
  const files: string[] = [];
  const stack = [root];
  const maxFiles = options.maxFiles ?? MAX_FILES;

  while (stack.length > 0 && files.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }

    for (const e of entries) {
      const fp = join(dir, e);
      const rp = relative(root, fp);
      if (isDirectory(fp)) {
        if (!SKIP_DIRS.has(e)) stack.push(fp);
      } else {
        files.push(rp);
      }
    }
  }

  return files;
}

export function buildCodeIndex(
  workspace: Workspace,
  options: IndexingOptions = {},
): CodeIndex {
  const root = workspace.importPath;
  const files = collectFiles(root, options);

  // Index by language
  const tsFiles = indexTypeScriptFiles(root, files, { maxFileSize: options.maxFileSize });
  const pyFiles = indexPythonFiles(root, files, { maxFileSize: options.maxFileSize });

  const allFiles = [...tsFiles, ...pyFiles];

  // Build symbol map
  const symbolMap: Record<string, CodeIndex['symbolMap'][string]> = {};
  for (const fi of allFiles) {
    for (const sym of fi.symbols) {
      if (!symbolMap[sym.name]) symbolMap[sym.name] = [];
      symbolMap[sym.name].push(sym);
    }
  }

  // Build import graph
  const importGraph: CodeIndex['importGraph'] = [];
  for (const fi of allFiles) {
    for (const imp of fi.imports) {
      importGraph.push({
        from: fi.path,
        to: imp.source,
        specifiers: imp.specifiers,
      });
    }
  }

  // Count languages
  const languages: Record<string, number> = {};
  for (const fi of allFiles) {
    languages[fi.language] = (languages[fi.language] || 0) + 1;
  }

  const totalLines = allFiles.reduce((sum, fi) => sum + fi.lineCount, 0);
  const totalSymbols = allFiles.reduce((sum, fi) => sum + fi.symbols.length, 0);

  // Compute confidence based on coverage
  const confidence = files.length > 0
    ? Math.round((allFiles.length / Math.min(files.length, MAX_FILES)) * 100) / 100
    : 0;

  return {
    workspaceId: workspace.workspaceId,
    indexedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalLines,
    totalSymbols,
    languages,
    files: allFiles,
    symbolMap,
    importGraph,
    confidence,
  };
}
