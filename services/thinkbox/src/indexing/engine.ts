/**
 * THINKBOX PR-004 — Code Indexing Engine
 *
 * Orchestrator: walks a project directory, detects languages, dispatches to
 * language-specific indexers, and produces a normalized CodeIndex.
 * Deterministic — same input → same output.
 */

import type { CodeIndex, IndexingOptions } from './types.ts';
import { indexTypeScriptFiles } from './typescript.ts';
import { indexPythonFiles } from './python.ts';
import { collectFiles, MAX_FILES } from '../collectFiles.ts';
import type { Workspace } from '../registry.ts';

export function buildCodeIndex(
  workspace: Workspace,
  options: IndexingOptions = {},
): CodeIndex {
  const root = workspace.importPath;
  const files = collectFiles(root, options.maxFiles ?? MAX_FILES);

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
