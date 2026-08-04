/**
 * THINKBOX PR-004 — Code Indexing Engine
 *
 * Core type definitions for code indexing. Extracts symbols, imports, exports,
 * and structural information from source files to build a searchable index.
 */

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'let' | 'var' | 'enum' | 'module' | 'unknown';
  file: string;
  line: number;
  exported: boolean;
  parameters?: string[];
  returnType?: string;
}

export interface ImportRecord {
  source: string;
  specifiers: string[];
  file: string;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface FileIndex {
  path: string;
  language: string;
  lineCount: number;
  sizeBytes: number;
  symbols: CodeSymbol[];
  imports: ImportRecord[];
  exports: string[];
  complexity: number; // cyclomatic complexity estimate
}

export interface CodeIndex {
  workspaceId: string;
  indexedAt: string;
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  languages: Record<string, number>; // language -> file count
  files: FileIndex[];
  symbolMap: Record<string, CodeSymbol[]>; // symbol name -> symbols
  importGraph: Array<{ from: string; to: string; specifiers: string[] }>;
  confidence: number;
}

export interface IndexingOptions {
  maxFiles?: number;
  maxFileSize?: number; // bytes
  skipDirs?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
}
