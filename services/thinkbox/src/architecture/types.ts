/**
 * THINKBOX PR-005 — Architecture Graph Engine
 *
 * Core type definitions for architecture graph generation.
 * Builds a directed graph of modules, their dependencies, and relationships.
 */

export interface ModuleNode {
  id: string; // file path or module name
  kind: 'component' | 'service' | 'utility' | 'config' | 'test' | 'unknown';
  language: string;
  exports: string[];
  imports: string[];
  complexity: number;
  layer?: 'presentation' | 'business' | 'data' | 'infrastructure';
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'dynamic-import' | 'require' | 'reference';
  specifiers: string[];
}

export interface ArchitectureLayer {
  name: string;
  modules: string[];
  dependencies: string[]; // other layers this layer depends on
}

export interface ArchitectureGraph {
  workspaceId: string;
  generatedAt: string;
  nodes: ModuleNode[];
  edges: DependencyEdge[];
  layers: ArchitectureLayer[];
  metrics: {
    totalModules: number;
    totalDependencies: number;
    avgComplexity: number;
    maxDepth: number;
    circularDependencies: string[][];
  };
  confidence: number;
}

export interface GraphOptions {
  includeTests?: boolean;
  includeConfigs?: boolean;
  maxDepth?: number;
}
