/**
 * THINKBOX PR-003 — Provisioning Planner
 *
 * Takes a Project Intelligence Manifest and produces a deterministic
 * Workspace Provision Plan. Every step is evidence-based and inspectable.
 * No execution — planning only.
 */

import crypto from 'node:crypto';
import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';
import type {
  WorkspaceProvisionPlan,
  ProvisionStep,
  ProvisionPhase,
  ProvisionTimelineEvent,
  WorkspaceReadyScore,
} from './types.ts';
import { buildDependencyGraph } from './dependency-graph.ts';

function stepId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function now(): string {
  return new Date().toISOString();
}

function addEvent(
  timeline: ProvisionTimelineEvent[],
  phase: ProvisionPhase,
  message: string,
  status: 'running' | 'complete' | 'failed',
  detail: string | null,
  agentId: string,
): void {
  timeline.push({
    id: crypto.randomUUID().slice(0, 8),
    timestamp: now(),
    phase,
    message,
    status,
    detail,
    agentId,
  });
}

export function createProvisionPlan(
  manifest: ProjectIntelligenceManifest,
  simulation: boolean = true,
): WorkspaceProvisionPlan {
  const timeline: ProvisionTimelineEvent[] = [];
  const phases: Record<ProvisionPhase, ProvisionStep[]> = {
    pending: [],
    runtime_detection: [],
    dependency_install: [],
    service_setup: [],
    env_config: [],
    build: [],
    test: [],
    deploy: [],
    ready: [],
  };
  const orderedSteps: string[] = [];
  const warnings: string[] = [];
  const risks: WorkspaceProvisionPlan['risks'] = [];
  let totalMs = 0;

  addEvent(timeline, 'pending', 'Provisioning planner initialized', 'running', null, 'KILOH');

  // --- Phase: Runtime Detection ---
  addEvent(timeline, 'runtime_detection', 'Detecting runtime requirements', 'running', null, 'FORGE');

  for (const rt of manifest.runtimes) {
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'runtime_detection',
      label: `${rt.kind} ${rt.version ?? ''}`.trim(),
      command: rt.kind === 'node' ? `node --version` : rt.kind === 'python' ? `python --version` : null,
      status: 'queued',
      reason: `Detected from ${rt.source}`,
      dependsOn: [],
      evidence: [rt.source],
      risk: 'none',
      estimatedDurationMs: 500,
    };
    phases.runtime_detection.push(s);
    orderedSteps.push(s.id);
    totalMs += 500;
  }

  if (manifest.runtimes.length === 0) {
    warnings.push('No runtime detected — project may need manual runtime configuration');
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'runtime_detection',
      label: 'runtime',
      command: null,
      status: 'queued',
      reason: 'No runtime detected',
      dependsOn: [],
      evidence: [],
      risk: 'high',
      estimatedDurationMs: null,
    };
    phases.runtime_detection.push(s);
    orderedSteps.push(s.id);
  }

  addEvent(timeline, 'runtime_detection', `${manifest.runtimes.length} runtime(s) identified`, 'complete', null, 'FORGE');

  // --- Phase: Dependency Install ---
  addEvent(timeline, 'dependency_install', 'Planning dependency installation', 'running', null, 'FORGE');

  const depStepIds: string[] = [];
  for (const dep of manifest.dependencies) {
    const cmd = dep.manager === 'npm' ? 'npm install' :
                dep.manager === 'bun' ? 'bun install' :
                dep.manager === 'pnpm' ? 'pnpm install' :
                dep.manager === 'yarn' ? 'yarn install' :
                dep.manager === 'pip' ? 'pip install -r requirements.txt' :
                dep.manager === 'poetry' ? 'poetry install' :
                dep.manager === 'cargo' ? 'cargo build' :
                dep.manager === 'go-modules' ? 'go mod download' :
                `${dep.manager} install`;

    const riskLevel = dep.lockfilePresent ? 'none' : 'medium';
    if (!dep.lockfilePresent) {
      warnings.push(`No lockfile for ${dep.manager} — versions may drift`);
      risks.push({ severity: 'medium', message: `${dep.manager} has no lockfile` });
    }

    const s: ProvisionStep = {
      id: stepId(),
      phase: 'dependency_install',
      label: `${dep.manager} install (${dep.totalCount} packages)`,
      command: simulation ? `[SIM] ${cmd}` : cmd,
      status: 'queued',
      reason: `${dep.direct.length} direct, ${dep.transitiveCount} transitive dependencies`,
      dependsOn: [],
      evidence: [dep.packageManifestPath, dep.lockfilePath].filter(Boolean) as string[],
      risk: riskLevel,
      estimatedDurationMs: dep.totalCount * 100,
    };
    phases.dependency_install.push(s);
    depStepIds.push(s.id);
    orderedSteps.push(s.id);
    totalMs += dep.totalCount * 100;
  }

  addEvent(timeline, 'dependency_install', `${manifest.dependencies.length} package manager(s) planned`, 'complete', null, 'FORGE');

  // --- Phase: Service Setup ---
  addEvent(timeline, 'service_setup', 'Detecting required services', 'running', null, 'FORGE');

  for (const svc of manifest.services) {
    const needsSetup = svc.kind === 'database' || svc.kind === 'cache' || svc.kind === 'queue';
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'service_setup',
      label: `${svc.name} (${svc.kind})`,
      command: needsSetup ? (simulation ? `[SIM] setup ${svc.name}` : `setup ${svc.name}`) : null,
      status: 'queued',
      reason: `Detected via ${svc.evidence[0] ?? 'dependency analysis'}`,
      dependsOn: depStepIds.slice(0, 1),
      evidence: svc.evidence.slice(0, 3),
      risk: svc.envVarsRequired.length > 0 ? 'medium' : 'low',
      estimatedDurationMs: needsSetup ? 2000 : 0,
    };
    phases.service_setup.push(s);
    orderedSteps.push(s.id);
    if (needsSetup) totalMs += 2000;
  }

  if (manifest.services.length === 0) {
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'service_setup',
      label: 'no external services',
      command: null,
      status: 'skipped',
      reason: 'No external services detected',
      dependsOn: [],
      evidence: [],
      risk: 'none',
      estimatedDurationMs: null,
    };
    phases.service_setup.push(s);
  }

  addEvent(timeline, 'service_setup', `${manifest.services.length} service(s) identified`, 'complete', null, 'FORGE');

  // --- Phase: Environment Config ---
  addEvent(timeline, 'env_config', 'Checking environment variables', 'running', null, 'FORGE');

  const requiredEnv = manifest.env.filter(e => e.required);
  const envStepIds: string[] = [];
  for (const env of requiredEnv) {
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'env_config',
      label: env.name,
      command: simulation ? `[SIM] check ${env.name}` : `check ${env.name}`,
      status: 'queued',
      reason: `Required ${env.category} variable from ${env.source}`,
      dependsOn: [],
      evidence: [env.source],
      risk: env.category === 'api-key' ? 'high' : 'medium',
      estimatedDurationMs: 100,
    };
    phases.env_config.push(s);
    envStepIds.push(s.id);
    orderedSteps.push(s.id);
  }

  if (requiredEnv.length === 0) {
    warnings.push('No required environment variables detected');
  } else if (requiredEnv.length > 10) {
    warnings.push(`${requiredEnv.length} required env vars detected — consider .env.example documentation`);
  }

  addEvent(timeline, 'env_config', `${requiredEnv.length} required env var(s) identified`, 'complete', null, 'FORGE');

  // --- Phase: Build ---
  addEvent(timeline, 'build', 'Planning build pipeline', 'running', null, 'FORGE');

  const buildStepIds: string[] = [];
  for (const buildCmd of manifest.scripts.build.slice(0, 5)) {
    const cmd = simulation ? `[SIM] ${buildCmd}` : buildCmd;
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'build',
      label: buildCmd,
      command: cmd,
      status: 'queued',
      reason: 'Build script detected',
      dependsOn: [...depStepIds],
      evidence: ['package.json scripts'],
      risk: 'low',
      estimatedDurationMs: 10000,
    };
    phases.build.push(s);
    buildStepIds.push(s.id);
    orderedSteps.push(s.id);
    totalMs += 10000;
  }

  if (manifest.scripts.build.length === 0) {
    warnings.push('No build scripts detected');
  }

  addEvent(timeline, 'build', `${manifest.scripts.build.length} build script(s) identified`, 'complete', null, 'FORGE');

  // --- Phase: Test ---
  addEvent(timeline, 'test', 'Planning test execution', 'running', null, 'GATE');

  for (const testCmd of manifest.scripts.test.slice(0, 3)) {
    const cmd = simulation ? `[SIM] ${testCmd}` : testCmd;
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'test',
      label: testCmd,
      command: cmd,
      status: 'queued',
      reason: 'Test script detected',
      dependsOn: [...buildStepIds],
      evidence: ['package.json scripts'],
      risk: 'low',
      estimatedDurationMs: 15000,
    };
    phases.test.push(s);
    orderedSteps.push(s.id);
    totalMs += 15000;
  }

  if (manifest.scripts.test.length === 0) {
    warnings.push('No test scripts detected');
  }

  addEvent(timeline, 'test', `${manifest.scripts.test.length} test script(s) identified`, 'complete', null, 'GATE');

  // --- Phase: Deploy ---
  addEvent(timeline, 'deploy', 'Checking deployment targets', 'running', null, 'FORGE');

  for (const target of manifest.deploy.targets) {
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'deploy',
      label: `Deploy to ${target}`,
      command: simulation ? `[SIM] deploy ${target}` : `deploy ${target}`,
      status: 'queued',
      reason: `Deployment target detected: ${target}`,
      dependsOn: [...buildStepIds],
      evidence: manifest.deploy.configFiles.slice(0, 2),
      risk: 'high',
      estimatedDurationMs: 30000,
    };
    phases.deploy.push(s);
    orderedSteps.push(s.id);
    totalMs += 30000;
  }

  if (manifest.deploy.targets.length === 0) {
    warnings.push('No deployment targets detected');
    const s: ProvisionStep = {
      id: stepId(),
      phase: 'deploy',
      label: 'no deployment targets',
      command: null,
      status: 'skipped',
      reason: 'No deployment configuration found',
      dependsOn: [],
      evidence: [],
      risk: 'none',
      estimatedDurationMs: null,
    };
    phases.deploy.push(s);
  }

  addEvent(timeline, 'deploy', `${manifest.deploy.targets.length} deploy target(s) identified`, 'complete', null, 'FORGE');

  // --- Phase: Ready ---
  addEvent(timeline, 'ready', 'Provision plan complete', 'complete', null, 'KILOH');

  const totalSteps = orderedSteps.length;

  // --- Ready Score ---
  const readyScore = computeReadyScore(manifest, phases);

  // --- Graph ---
  const graph = buildDependencyGraph(manifest);

  // --- Warnings for confidence ---
  if (manifest.confidence < 0.5) {
    risks.push({ severity: 'high', message: `Low detection confidence (${Math.round(manifest.confidence * 100)}%)` });
  }

  return {
    workspaceId: manifest.workspaceId,
    plannedAt: now(),
    summary: `Plan: ${totalSteps} steps across ${Object.values(phases).filter(p => p.length > 0).length} phases`,
    phases,
    orderedSteps,
    graph,
    timeline,
    readyScore,
    simulation,
    totalSteps,
    estimatedTotalDurationMs: totalMs,
    warnings,
    risks,
  };
}

function computeReadyScore(
  manifest: ProjectIntelligenceManifest,
  phases: Record<ProvisionPhase, ProvisionStep[]>,
): WorkspaceReadyScore {
  const breakdown: Record<string, { score: number; maxScore: number; issues: string[] }> = {};
  let totalScore = 0;
  let totalMax = 0;

  function score(name: string, max: number, condition: boolean, ...issues: string[]) {
    const s = condition ? max : 0;
    breakdown[name] = { score: s, maxScore: max, issues: condition ? [] : issues };
    totalScore += s;
    totalMax += max;
  }

  score('Runtime Detection', 15, manifest.runtimes.length > 0, 'No runtime detected');
  score('Dependency Managers', 15, manifest.dependencies.length > 0, 'No package manager detected');
  score('Lockfiles Present', 10, manifest.dependencies.some(d => d.lockfilePresent), 'Missing lockfiles');
  score('Build Scripts', 10, manifest.scripts.build.length > 0, 'No build scripts');
  score('Test Scripts', 10, manifest.scripts.test.length > 0, 'No test scripts');
  score('CI Configuration', 5, manifest.ci.systems.length > 0, 'No CI configured');
  score('Deploy Targets', 10, manifest.deploy.targets.length > 0, 'No deploy targets');
  score('Documentation', 5, manifest.totalFiles > 10, 'Very few files');
  score('Service Detection', 10, manifest.services.length > 0, 'No services detected');
  score('Env Variables', 5, manifest.env.length > 0, 'No env vars found');
  score('Confidence', 5, manifest.confidence > 0.5, 'Low confidence');

  const riskScore = manifest.risks?.length
    ? Math.max(0, 10 - (manifest.risks as unknown as any[]).length * 2) ?? 10
    : 10;
  score('Risk Assessment', 10, riskScore > 5, 'Multiple risks identified');

  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const grade = pct >= 90 ? 'A' : pct >= 70 ? 'B' : pct >= 50 ? 'C' : pct >= 30 ? 'D' : 'F';

  const recommended =
    !manifest.dependencies.some(d => d.lockfilePresent) ? 'Add lockfiles for deterministic installs' :
    manifest.scripts.build.length === 0 ? 'Configure build scripts' :
    manifest.deploy.targets.length === 0 ? 'Add deployment configuration' :
    pct >= 90 ? 'Workspace ready for provisioning' :
    'Review warnings and re-analyze';

  return {
    total: pct,
    runtime: breakdown['Runtime Detection']?.score ?? 0,
    dependencies: (breakdown['Dependency Managers']?.score ?? 0) + (breakdown['Lockfiles Present']?.score ?? 0),
    environment: (breakdown['Env Variables']?.score ?? 0),
    ci: (breakdown['CI Configuration']?.score ?? 0),
    deploy: (breakdown['Deploy Targets']?.score ?? 0),
    documentation: (breakdown['Documentation']?.score ?? 0),
    risk: (breakdown['Risk Assessment']?.score ?? 10),
    grade,
    breakdown,
    recommendedNextAction: recommended,
  };
}
