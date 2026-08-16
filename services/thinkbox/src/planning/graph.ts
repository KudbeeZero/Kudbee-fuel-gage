/**
 * THINKBOX PR-007 — Engineering Graph Engine
 *
 * The canonical graph model. Every subsystem (intelligence, execution,
 * agents, decisions, deployments) feeds into this single source of truth.
 * Supports query, traversal, and impact analysis.
 */

import crypto from 'node:crypto';
import type { EngineeringNode, EngineeringEdge, EngineeringNodeKind, EngineeringEdgeKind, EngineeringGraph, ImpactAnalysisResult } from './types.ts';

function nid(): string { return crypto.randomUUID().slice(0, 8); }

export function createEngineeringGraph(): EngineeringGraph {
  const nodes: EngineeringNode[] = [];
  const edges: EngineeringEdge[] = [];
  const nodeIndex = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  function addNode(kind: EngineeringNodeKind, label: string, props: Record<string, unknown> = {}, source = 'system', confidence = 1, agentId: string | null = null): EngineeringNode {
    const n: EngineeringNode = {
      id: `${kind}-${nid()}`,
      label, kind, properties: props,
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source, confidence, agentId },
    };
    nodeIndex.set(n.id, nodes.length);
    nodes.push(n);
    adjacency.set(n.id, new Set());
    return n;
  }

  function addEdge(from: string, to: string, kind: EngineeringEdgeKind, label = '', props: Record<string, unknown> = {}, source = 'system', confidence = 1): EngineeringEdge {
    const e: EngineeringEdge = {
      id: `edge-${nid()}`,
      from, to, kind, label: label || kind,
      properties: props,
      metadata: { createdAt: new Date().toISOString(), source, confidence },
    };
    edges.push(e);
    adj(from).add(to);
    return e;
  }

  function adj(id: string): Set<string> {
    const s = adjacency.get(id);
    if (!s) { const ns = new Set<string>(); adjacency.set(id, ns); return ns; }
    return s;
  }

  function query(predicate: (node: EngineeringNode) => boolean): EngineeringNode[] {
    return nodes.filter(predicate);
  }

  function traverse(startId: string, edgeKind?: EngineeringEdgeKind): EngineeringNode[] {
    const visited = new Set<string>();
    const result: EngineeringNode[] = [];
    const stack = [startId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const idx = nodeIndex.get(id);
      if (idx !== undefined) result.push(nodes[idx]);
      const relevant = edges.filter(e => e.from === id && (!edgeKind || e.kind === edgeKind));
      for (const e of relevant) { if (!visited.has(e.to)) stack.push(e.to); }
    }
    return result;
  }

  function connected(id: string): EngineeringNode[] {
    const result = new Set<EngineeringNode>();
    const incoming = edges.filter(e => e.to === id);
    const outgoing = edges.filter(e => e.from === id);
    for (const e of [...incoming, ...outgoing]) {
      for (const nid of [e.from, e.to]) {
        const idx = nodeIndex.get(nid);
        if (idx !== undefined && nid !== id) result.add(nodes[idx]);
      }
    }
    return [...result];
  }

  function impactAnalysis(nodeId: string): ImpactAnalysisResult {
    const affected = new Map<string, { node: EngineeringNode; depth: number }>();
    const affectedEdges: EngineeringEdge[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > 5) continue;
      visited.add(id);
      const idx = nodeIndex.get(id);
      if (idx !== undefined) affected.set(id, { node: nodes[idx], depth });
      for (const e of edges) {
        if (e.from === id && !visited.has(e.to)) {
          affectedEdges.push(e);
          queue.push({ id: e.to, depth: depth + 1 });
        }
        if (e.to === id && !visited.has(e.from) && e.kind === 'depends_on') {
          affectedEdges.push(e);
          queue.push({ id: e.from, depth: depth + 1 });
        }
      }
    }

    const maxDepth = Math.max(...[...affected.values()].map(a => a.depth), 0);
    const risk: ImpactAnalysisResult['riskLevel'] = maxDepth >= 4 ? 'high' : maxDepth >= 2 ? 'medium' : 'low';
    const recommendations: string[] = [];
    if (risk === 'high') recommendations.push('Consider rolling back and reassessing');
    if (affected.size > 10) recommendations.push('Large blast radius — consider incremental changes');
    if (affectedEdges.some(e => e.kind === 'blocks')) recommendations.push('Blocking relationships detected — verify sequencing');

    return {
      affectedNodes: [...affected.values()].map(a => a.node),
      affectedEdges,
      riskLevel: risk,
      recommendations,
    };
  }

  return {
    nodes, edges, query, traverse, connected, impactAnalysis,
    addNode, addEdge,
  } as EngineeringGraph & { addNode: typeof addNode; addEdge: typeof addEdge };
}

export function seedEngineeringGraph(graph: EngineeringGraph & { addNode: Function; addEdge: Function }, workspaceId: string): void {
  const ws = graph.addNode('workspace', 'Kudbee', { workspaceId });
  const lang = graph.addNode('file', 'TypeScript', {}, 'pr-002', 0.83);
  const fw = graph.addNode('file', 'React/Vite', {}, 'pr-002', 0.83);
  const pkg = graph.addNode('dependency', 'Bun', {}, 'pr-002', 0.85);
  const db = graph.addNode('database', 'PostgreSQL', { kind: 'database' }, 'pr-002', 0.9);
  const cache = graph.addNode('service', 'Redis', { kind: 'cache' }, 'pr-002', 0.9);
  const ci = graph.addNode('service', 'GitHub Actions', { kind: 'ci' }, 'pr-002', 1);
  const deploy = graph.addNode('deployment', 'AWS EC2', {}, 'pr-002', 1);
  const agents = ['KILOH', 'FORGE', 'DTHINK', 'GATE', 'JOURNAL', 'BUS'].map(a =>
    graph.addNode('agent', a, {}, 'system', 1, a));

  graph.addEdge(ws, lang, 'contains');
  graph.addEdge(ws, fw, 'contains');
  graph.addEdge(ws, pkg, 'depends_on');
  graph.addEdge(ws, db, 'depends_on');
  graph.addEdge(ws, cache, 'depends_on');
  graph.addEdge(ws, ci, 'verifies');
  graph.addEdge(ws, deploy, 'deploys');
  graph.addEdge(pkg, lang, 'depends_on');
  graph.addEdge(deploy, db, 'depends_on');
  graph.addEdge(deploy, cache, 'depends_on');
  for (const a of agents) graph.addEdge(ws, a, 'owns');
}
