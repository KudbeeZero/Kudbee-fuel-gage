/**
 * THINKBOX PR-004 — Python Code Indexer
 *
 * Extracts functions, classes, imports, and exports from Python files.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { CodeSymbol, ImportRecord, FileIndex } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function estimateComplexity(content: string): number {
  let complexity = 1;
  const branches = content.match(/\b(if|elif|else|for|while|except|with|and|or)\b/g);
  if (branches) complexity += branches.length;
  return complexity;
}

/** Precompute a line-start offset table for O(log L) line lookup per index. */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) offsets.push(i + 1);
  }
  return offsets;
}

/** Binary-search the line number (1-based) for a character offset. */
function lineAt(offsets: number[], index: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function extractSymbols(content: string, file: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lineOffsets = buildLineOffsets(content);

  // Function definitions
  const funcPattern = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?/gm;
  for (const m of content.matchAll(funcPattern)) {
    symbols.push({
      name: m[1],
      kind: 'function',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: !m[1].startsWith('_'),
      parameters: m[2] ? m[2].split(',').map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean) : [],
      returnType: m[3] || undefined,
    });
  }

  // Class definitions
  const classPattern = /^class\s+(\w+)/gm;
  for (const m of content.matchAll(classPattern)) {
    symbols.push({
      name: m[1],
      kind: 'class',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: !m[1].startsWith('_'),
    });
  }

  return symbols;
}

function extractImports(content: string, file: string): ImportRecord[] {
  const imports: ImportRecord[] = [];

  // from module import x, y
  const fromPattern = /^from\s+([\w.]+)\s+import\s+(.+)/gm;
  for (const m of content.matchAll(fromPattern)) {
    const specifiers = m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    imports.push({ source: m[1], specifiers, file, isDefault: false, isNamespace: false });
  }

  // import module
  const importPattern = /^import\s+([\w.,\s]+)/gm;
  for (const m of content.matchAll(importPattern)) {
    const modules = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    for (const mod of modules) {
      imports.push({ source: mod, specifiers: [], file, isDefault: true, isNamespace: false });
    }
  }

  return imports;
}

function extractExports(content: string, _file: string): string[] {
  const exports: string[] = [];

  // __all__ = ['x', 'y']
  const allPattern = /__all__\s*=\s*\[([^\]]+)\]/;
  const match = content.match(allPattern);
  if (match) {
    exports.push(...match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean));
  }

  return exports;
}

const PY_EXTENSIONS = new Set(['.py', '.pyi']);

export function indexPythonFiles(root: string, files: string[], options: { maxFileSize?: number } = {}): FileIndex[] {
  const maxFileSize = options.maxFileSize ?? 500_000;
  const indexes: FileIndex[] = [];

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!PY_EXTENSIONS.has(ext)) continue;

    const fullPath = join(root, f);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (stat.size > maxFileSize) continue;

    const content = readTextSafe(fullPath);
    if (!content) continue;

    const lines = content.split('\n');
    const symbols = extractSymbols(content, f);
    const imports = extractImports(content, f);
    const exportsList = extractExports(content, f);

    indexes.push({
      path: f,
      language: 'python',
      lineCount: lines.length,
      sizeBytes: stat.size,
      symbols,
      imports,
      exports: exportsList,
      complexity: estimateComplexity(content),
    });
  }

  return indexes;
}
