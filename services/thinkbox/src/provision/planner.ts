import crypto from 'node:crypto';
import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';
import type { WorkspaceProvisionPlan, ProvisionStep, ProvisionPhase } from './types.ts';

function sid() { return crypto.randomUUID().slice(0, 8); }
function now() { return new Date().toISOString(); }

export function createProvisionPlan(manifest: ProjectIntelligenceManifest, simulation = true): WorkspaceProvisionPlan {
  const phases: Record<string, ProvisionStep[]> = { pending: [], runtime_detection: [], dependency_install: [], service_setup: [], env_config: [], build: [], test: [], deploy: [], ready: [] };
  const ordered: string[] = []; let totalSteps = 0; let totalMs = 0;

  for (const rt of manifest.runtimes) {
    const s: ProvisionStep = { id: sid(), phase: 'runtime_detection', label: `${rt.kind} ${rt.version ?? ''}`, command: simulation ? `[SIM] check ${rt.kind}` : `check ${rt.kind}`, status: 'queued', reason: `From ${rt.source}`, dependsOn: [], evidence: [rt.source], risk: 'none', estimatedDurationMs: 500 };
    phases.runtime_detection.push(s); ordered.push(s.id); totalSteps++; totalMs += 500;
  }

  for (const dep of manifest.dependencies) {
    const cmd = dep.manager === 'npm' ? 'npm install' : dep.manager === 'bun' ? 'bun install' : dep.manager === 'pnpm' ? 'pnpm install' : dep.manager === 'pip' ? 'pip install' : dep.manager === 'poetry' ? 'poetry install' : `${dep.manager} install`;
    const s: ProvisionStep = { id: sid(), phase: 'dependency_install', label: `${dep.manager} (${dep.totalCount} pkgs)`, command: simulation ? `[SIM] ${cmd}` : cmd, status: 'queued', reason: `${dep.direct.length} deps`, dependsOn: [], evidence: [dep.packageManifestPath], risk: dep.lockfilePresent ? 'none' : 'medium', estimatedDurationMs: dep.totalCount * 100 };
    phases.dependency_install.push(s); ordered.push(s.id); totalSteps++; totalMs += dep.totalCount * 100;
  }

  for (const svc of manifest.services) {
    const s: ProvisionStep = { id: sid(), phase: 'service_setup', label: svc.name, command: svc.kind === 'database' || svc.kind === 'cache' ? (simulation ? `[SIM] setup ${svc.name}` : null) : null, status: 'queued', reason: `Detected ${svc.kind}`, dependsOn: [], evidence: svc.evidence.slice(0, 2), risk: svc.envVarsRequired.length > 0 ? 'medium' : 'low', estimatedDurationMs: 1000 };
    phases.service_setup.push(s); ordered.push(s.id); totalSteps++; totalMs += 1000;
  }

  for (const env of manifest.env.filter((e: any) => e.required)) {
    const s: ProvisionStep = { id: sid(), phase: 'env_config', label: env.name, command: simulation ? `[SIM] check ${env.name}` : null, status: 'queued', reason: `${env.category} from ${env.source}`, dependsOn: [], evidence: [env.source], risk: env.category === 'api-key' ? 'high' : 'medium', estimatedDurationMs: 100 };
    phases.env_config.push(s); ordered.push(s.id); totalSteps++;
  }

  for (const b of manifest.scripts.build.slice(0, 3)) {
    const s: ProvisionStep = { id: sid(), phase: 'build', label: b, command: simulation ? `[SIM] ${b}` : b, status: 'queued', reason: 'build script', dependsOn: [], evidence: ['package.json'], risk: 'low', estimatedDurationMs: 10000 };
    phases.build.push(s); ordered.push(s.id); totalSteps++; totalMs += 10000;
  }

  for (const t of manifest.scripts.test.slice(0, 2)) {
    const s: ProvisionStep = { id: sid(), phase: 'test', label: t, command: simulation ? `[SIM] ${t}` : t, status: 'queued', reason: 'test script', dependsOn: [], evidence: ['package.json'], risk: 'low', estimatedDurationMs: 15000 };
    phases.test.push(s); ordered.push(s.id); totalSteps++; totalMs += 15000;
  }

  for (const t of manifest.deploy.targets) {
    const s: ProvisionStep = { id: sid(), phase: 'deploy', label: `Deploy ${t}`, command: simulation ? `[SIM] deploy ${t}` : `deploy ${t}`, status: 'queued', reason: `Target: ${t}`, dependsOn: [], evidence: [], risk: 'high', estimatedDurationMs: 30000 };
    phases.deploy.push(s); ordered.push(s.id); totalSteps++; totalMs += 30000;
  }

  const score = Math.min(100, (manifest.languages.length > 0 ? 15 : 0) + (manifest.dependencies.length > 0 ? 15 : 0) + (manifest.dependencies.some((d: any) => d.lockfilePresent) ? 10 : 0) + (manifest.scripts.build.length > 0 ? 10 : 0) + (manifest.scripts.test.length > 0 ? 10 : 0) + (manifest.ci.systems.length > 0 ? 5 : 0) + (manifest.deploy.targets.length > 0 ? 10 : 0) + (manifest.services.length > 0 ? 10 : 0) + (manifest.env.length > 0 ? 5 : 0) + 10);

  const nodes = [{ id: 'root', label: manifest.summary || 'Repository', kind: 'language', version: null, present: true, required: true, children: [], detail: {} }];
  for (const l of manifest.languages) nodes.push({ id: `l-${l}`, label: l, kind: 'language', version: null, present: true, required: true, children: [], detail: {} });
  for (const s of manifest.services) nodes.push({ id: `s-${s.name}`, label: s.name, kind: s.kind, version: null, present: true, required: false, children: [], detail: {} });
  for (const c of manifest.ci.systems) nodes.push({ id: `ci-${c}`, label: c, kind: 'ci', version: null, present: true, required: false, children: [], detail: {} });
  for (const d of manifest.deploy.targets) nodes.push({ id: `d-${d}`, label: d, kind: 'deploy', version: null, present: true, required: false, children: [], detail: {} });

  const edges = nodes.slice(1).map(n => ({ from: 'root', to: n.id, label: n.kind }));

  return {
    workspaceId: manifest.workspaceId, plannedAt: now(), summary: `${totalSteps} steps`, simulation, totalSteps, estimatedTotalDurationMs: totalMs, warnings: [], risks: [],
    phases, orderedSteps: ordered,
    graph: { nodes, edges, rootId: 'root' },
    timeline: [], readyScore: { total: score, grade: score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D', runtime: manifest.runtimes.length > 0 ? 15 : 0, dependencies: manifest.dependencies.length > 0 ? 25 : 0, environment: manifest.env.length > 0 ? 5 : 0, ci: manifest.ci.systems.length > 0 ? 5 : 0, deploy: manifest.deploy.targets.length > 0 ? 10 : 0, risk: 10, recommendedNextAction: 'execute plan', breakdown: {} },
  };
}
