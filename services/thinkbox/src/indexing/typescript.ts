/**
 * THINKBOX PR-004 — TypeScript/JavaScript Code Indexer
 *
 * Extracts symbols, imports, exports from .ts, .tsx, .js, .jsx files.
 * Uses regex-based parsing (no AST dependency) for speed and zero-install.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { CodeSymbol, ImportRecord, FileIndex } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function estimateComplexity(content: string): number {
  let complexity = 1;
  const branches = content.match(/\b(if|else|else if|for|while|do|switch|case|catch|\?\?|\?[^.])/g);
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
  const exported = (m: RegExpMatchArray) => /^export\b/.test(m[0]);

  // Function declarations
  const funcPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\S+))?/gm;
  for (const m of content.matchAll(funcPattern)) {
    symbols.push({
      name: m[1],
      kind: 'function',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
      parameters: m[2] ? m[2].split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean) : [],
      returnType: m[3] || undefined,
    });
  }

  // Arrow functions / const functions
  const arrowPattern = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(?([^)]*)\)?\s*(?::\s*\S+)?\s*=>/gm;
  for (const m of content.matchAll(arrowPattern)) {
    symbols.push({
      name: m[1],
      kind: 'function',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
      parameters: m[2] ? m[2].split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean) : [],
    });
  }

  // Class declarations
  const classPattern = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
  for (const m of content.matchAll(classPattern)) {
    symbols.push({
      name: m[1],
      kind: 'class',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
    });
  }

  // Interface declarations
  const interfacePattern = /^(?:export\s+)?interface\s+(\w+)/gm;
  for (const m of content.matchAll(interfacePattern)) {
    symbols.push({
      name: m[1],
      kind: 'interface',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
    });
  }

  // Type declarations
  const typePattern = /^(?:export\s+)?type\s+(\w+)\s*=/gm;
  for (const m of content.matchAll(typePattern)) {
    symbols.push({
      name: m[1],
      kind: 'type',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
    });
  }

  // Enum declarations
  const enumPattern = /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/gm;
  for (const m of content.matchAll(enumPattern)) {
    symbols.push({
      name: m[1],
      kind: 'enum',
      file,
      line: lineAt(lineOffsets, m.index!),
      exported: exported(m),
    });
  }

  return symbols;
}

function extractImports(content: string, file: string): ImportRecord[] {
  const imports: ImportRecord[] = [];

  // import { x, y } from 'module'
  const namedPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(namedPattern)) {
    imports.push({
      source: m[2],
      specifiers: m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean),
      file,
      isDefault: false,
      isNamespace: false,
    });
  }

  // import x from 'module'
  const defaultPattern = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(defaultPattern)) {
    imports.push({
      source: m[2],
      specifiers: [m[1]],
      file,
      isDefault: true,
      isNamespace: false,
    });
  }

  // import * as x from 'module'
  const namespacePattern = /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(namespacePattern)) {
    imports.push({
      source: m[2],
      specifiers: [m[1]],
      file,
      isDefault: false,
      isNamespace: true,
    });
  }

  // import 'module' (side-effect)
  const sideEffectPattern = /import\s+['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(sideEffectPattern)) {
    imports.push({
      source: m[1],
      specifiers: [],
      file,
      isDefault: false,
      isNamespace: false,
    });
  }

  return imports;
}

function extractExports(content: string, file: string): string[] {
  const exports: string[] = [];

  // export { x, y }
  const namedExportPattern = /export\s*\{([^}]+)\}/g;
  for (const m of content.matchAll(namedExportPattern)) {
    exports.push(...m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean));
  }

  // export function/class/const/let/var/type/interface/enum name
  const exportDeclPattern = /export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
  for (const m of content.matchAll(exportDeclPattern)) {
    exports.push(m[1]);
  }

  // export default
  if (/export\s+default\s/.test(content)) {
    exports.push('default');
  }

  return [...new Set(exports)];
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function getLanguage(ext: string): string {
  switch (ext) {
    case '.ts': return 'typescript';
    case '.tsx': return 'typescript-react';
    case '.js': return 'javascript';
    case '.jsx': return 'javascript-react';
    case '.mjs': return 'javascript-module';
    case '.cjs': return 'javascript-commonjs';
    default: return 'unknown';
  }
}

export function indexTypeScriptFiles(root: string, files: string[], options: { maxFileSize?: number } = {}): FileIndex[] {
  const maxFileSize = options.maxFileSize ?? 500_000; // 500KB default
  const indexes: FileIndex[] = [];

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!TS_EXTENSIONS.has(ext)) continue;

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
      language: getLanguage(ext),
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
