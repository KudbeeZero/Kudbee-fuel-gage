/**
 * THINKBOX PR-005 — Architecture Graph Engine
 *
 * Builds a directed graph of modules from the CodeIndex (PR-004),
 * detects layers, finds circular dependencies, and computes metrics.
 * Uses Vector Memory for persistent graph storage when available.
 */

import type { CodeIndex } from '../indexing/types.ts';
import type { ArchitectureGraph, ModuleNode, DependencyEdge, ArchitectureLayer, GraphOptions } from './types.ts';

function detectModuleKind(path: string): ModuleNode['kind'] {
  if (path.includes('.test.') || path.includes('.spec.')) return 'test';
  if (path.includes('component') || path.endsWith('.tsx') || path.endsWith('.jsx')) return 'component';
  if (path.includes('service') || path.includes('api') || path.includes('route')) return 'service';
  if (path.includes('util') || path.includes('helper') || path.includes('lib')) return 'utility';
  if (path.includes('config') || path.endsWith('.json') || path.endsWith('.yaml')) return 'config';
  return 'unknown';
}

function detectLayer(path: string): ModuleNode['layer'] {
  if (path.includes('ui') || path.includes('view') || path.includes('component') || path.includes('page')) return 'presentation';
  if (path.includes('service') || path.includes('business') || path.includes('logic')) return 'business';
  if (path.includes('repo') || path.includes('data') || path.includes('model') || path.includes('entity')) return 'data';
  if (path.includes('infra') || path.includes('db') || path.includes('redis') || path.includes('queue')) return 'infrastructure';
  return undefined;
}

function findCircularDependencies(edges: DependencyEdge[]): string[][] {
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    for (const neighbor of adj[node] || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        const cycleStart = stack.indexOf(neighbor);
        cycles.push(stack.slice(cycleStart));
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of Object.keys(adj)) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

function computeMaxDepth(nodes: ModuleNode[], edges: DependencyEdge[]): number {
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  }

  const depths: Record<string, number> = {};

  function depth(node: string, visited: Set<string>): number {
    if (depths[node] !== undefined) return depths[node];
    if (visited.has(node)) return 0; // cycle
    visited.add(node);

    let maxD = 0;
    for (const neighbor of adj[node] || []) {
      maxD = Math.max(maxD, depth(neighbor, visited) + 1);
    }

    visited.delete(node);
    depths[node] = maxD;
    return maxD;
  }

  let globalMax = 0;
  for (const node of nodes.map(n => n.id)) {
    globalMax = Math.max(globalMax, depth(node, new Set()));
  }

  return globalMax;
}

export function buildArchitectureGraph(
  codeIndex: CodeIndex,
  options: GraphOptions = {},
): ArchitectureGraph {
  const includeTests = options.includeTests ?? false;
  const includeConfigs = options.includeConfigs ?? false;

  // Filter files based on options
  const filteredFiles = codeIndex.files.filter(fi => {
    const kind = detectModuleKind(fi.path);
    if (!includeTests && kind === 'test') return false;
    if (!includeConfigs && kind === 'config') return false;
    return true;
  });

  // Build nodes
  const nodes: ModuleNode[] = filteredFiles.map(fi => ({
    id: fi.path,
    kind: detectModuleKind(fi.path),
    language: fi.language,
    exports: fi.exports,
    imports: fi.imports.map(i => i.source),
    complexity: fi.complexity,
    layer: detectLayer(fi.path),
  }));

  // Build edges from import graph
  const edges: DependencyEdge[] = [];
  for (const fi of filteredFiles) {
    for (const imp of fi.imports) {
      edges.push({
        from: fi.path,
        to: imp.source,
        type: 'import',
        specifiers: imp.specifiers,
      });
    }
  }

  // Detect layers
  const layerMap: Record<string, string[]> = {};
  for (const node of nodes) {
    const layer = node.layer || 'unknown';
    if (!layerMap[layer]) layerMap[layer] = [];
    layerMap[layer].push(node.id);
  }

  const layers: ArchitectureLayer[] = Object.entries(layerMap).map(([name, modules]) => ({
    name,
    modules,
    dependencies: [], // TODO: infer from imports
  }));

  // Compute metrics
  const circularDeps = findCircularDependencies(edges);
  const maxDepth = computeMaxDepth(nodes, edges);
  const avgComplexity = nodes.length > 0
    ? Math.round((nodes.reduce((sum, n) => sum + n.complexity, 0) / nodes.length) * 100) / 100
    : 0;

  const confidence = codeIndex.confidence;

  return {
    workspaceId: codeIndex.workspaceId,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    layers,
    metrics: {
      totalModules: nodes.length,
      totalDependencies: edges.length,
      avgComplexity,
      maxDepth,
      circularDependencies: circularDeps,
    },
    confidence,
  };
}
