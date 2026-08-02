/**
 * THINKBOX PR-003 — Dependency Graph Builder
 *
 * Generates a visualizable internal dependency graph from the Project Intelligence
 * Manifest. Every node is clickable, every dependency inspectable.
 */

import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';
import type { DependencyGraph, DependencyNode } from './types.ts';

let nodeCounter = 0;
function nextId(): string {
  return `n${++nodeCounter}`;
}

export function buildDependencyGraph(manifest: ProjectIntelligenceManifest): DependencyGraph {
  nodeCounter = 0;
  const nodes: DependencyNode[] = [];
  const edges: Array<{ from: string; to: string; label: string }> = [];

  const rootId = nextId();
  nodes.push({
    id: rootId,
    label: manifest.summary || 'Repository',
    kind: 'language',
    version: null,
    present: true,
    required: true,
    children: [],
    detail: { workspaceId: manifest.workspaceId },
  });

  const langIds: string[] = [];
  for (const lang of manifest.languages) {
    const id = nextId();
    langIds.push(id);
    nodes.push({
      id, label: lang, kind: 'language', version: null, present: true, required: true,
      children: [], detail: {},
    });
    edges.push({ from: rootId, to: id, label: 'language' });
  }

  const fwIds: string[] = [];
  for (const fw of manifest.frameworks) {
    const id = nextId();
    fwIds.push(id);
    nodes.push({
      id, label: fw, kind: 'framework', version: null, present: true, required: true,
      children: [], detail: {},
    });
    edges.push({ from: rootId, to: id, label: 'framework' });
  }

  for (const dep of manifest.dependencies) {
    const pkgId = nextId();
    nodes.push({
      id: pkgId,
      label: `${dep.manager} (${dep.totalCount} deps)`,
      kind: 'package-manager',
      version: dep.lockfileKind,
      present: dep.lockfilePresent,
      required: true,
      children: [],
      detail: { manager: dep.manager, lockfile: dep.lockfileKind, totalCount: dep.totalCount },
    });
    edges.push({ from: rootId, to: pkgId, label: 'package manager' });
    for (const lid of langIds) {
      edges.push({ from: pkgId, to: lid, label: 'depends on' });
    }
  }

  for (const rt of manifest.runtimes) {
    const id = nextId();
    nodes.push({
      id, label: rt.kind, kind: 'runtime', version: rt.version, present: true, required: true,
      children: [], detail: { source: rt.source },
    });
    edges.push({ from: rootId, to: id, label: 'runtime' });
  }

  for (const svc of manifest.services) {
    const id = nextId();
    nodes.push({
      id, label: svc.name, kind: 'service', version: null, present: true,
      required: svc.envVarsRequired.length > 0,
      children: [],
      detail: { kind: svc.kind, sdk: svc.sdk, evidence: svc.evidence },
    });
    edges.push({ from: rootId, to: id, label: svc.kind });
  }

  for (const env of manifest.env.filter(e => e.required)) {
    const id = nextId();
    nodes.push({
      id, label: env.name, kind: 'env-var', version: null, present: true, required: env.required,
      children: [], detail: { category: env.category, source: env.source },
    });
    edges.push({ from: rootId, to: id, label: 'env var' });
  }

  for (const ci of manifest.ci.systems) {
    const id = nextId();
    nodes.push({
      id, label: ci, kind: 'ci', version: null, present: true, required: false,
      children: [], detail: {},
    });
    edges.push({ from: rootId, to: id, label: 'ci' });
  }

  for (const dt of manifest.deploy.targets) {
    const id = nextId();
    nodes.push({
      id, label: dt, kind: 'deploy', version: null, present: true, required: false,
      children: [], detail: {},
    });
    edges.push({ from: rootId, to: id, label: 'deploy' });
  }

  return { nodes, edges, rootId };
}
