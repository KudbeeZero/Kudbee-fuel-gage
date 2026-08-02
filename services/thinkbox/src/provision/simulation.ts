/**
 * THINKBOX PR-003 — Simulation Engine
 *
 * Dry-run mode for the provisioning pipeline. When enabled, all commands
 * are prefixed with [SIM] and no filesystem changes occur. The UI displays
 * exactly what would happen without executing anything.
 */

import type { WorkspaceProvisionPlan, ProvisionStep, ProvisionPhase } from './types.ts';

export interface SimulationResult {
  plan: WorkspaceProvisionPlan;
  dryRun: boolean;
  completedSteps: number;
  totalSteps: number;
  estimatedCompletionMs: number;
  logs: string[];
}

export function runSimulation(plan: WorkspaceProvisionPlan): SimulationResult {
  const logs: string[] = [];
  logs.push(`[SIM] Provisioning simulation started for workspace ${plan.workspaceId}`);
  logs.push(`[SIM] Mode: DRY-RUN — no commands will execute`);
  logs.push(`[SIM] Plan: ${plan.totalSteps} steps across ${Object.keys(plan.phases).filter(k => plan.phases[k as ProvisionPhase].length > 0).length} phases`);

  const phaseOrder: ProvisionPhase[] = [
    'pending', 'runtime_detection', 'dependency_install', 'service_setup',
    'env_config', 'build', 'test', 'deploy', 'ready',
  ];

  for (const phase of phaseOrder) {
    const steps = plan.phases[phase];
    if (steps.length === 0) continue;

    logs.push(`\n[SIM] ── Phase: ${phase} ──`);
    for (const step of steps) {
      const riskLabel = step.risk !== 'none' ? ` [RISK: ${step.risk}]` : '';
      if (step.command) {
        logs.push(`[SIM]   → ${step.command}  (${step.label})${riskLabel}`);
      } else if (step.status === 'skipped') {
        logs.push(`[SIM]   ⊘ SKIPPED: ${step.label} — ${step.reason}`);
      } else {
        logs.push(`[SIM]   ✓ ${step.label}${riskLabel}`);
      }
    }
  }

  logs.push(`\n[SIM] Simulation complete — ${plan.totalSteps} steps previewed`);
  logs.push(`[SIM] Estimated duration: ${Math.round(plan.estimatedTotalDurationMs / 1000)}s`);
  logs.push(`[SIM] Warnings: ${plan.warnings.length} | Risks: ${plan.risks.length}`);
  logs.push(`[SIM] Ready Score: ${plan.readyScore.total}/100 (${plan.readyScore.grade})`);

  return {
    plan,
    dryRun: true,
    completedSteps: 0,
    totalSteps: plan.totalSteps,
    estimatedCompletionMs: plan.estimatedTotalDurationMs,
    logs,
  };
}

export function toggleSimulation(plan: WorkspaceProvisionPlan, enabled: boolean): WorkspaceProvisionPlan {
  plan.simulation = enabled;
  for (const phase of Object.keys(plan.phases) as ProvisionPhase[]) {
    for (const step of plan.phases[phase]) {
      if (step.command && step.command.startsWith('[SIM]') && !enabled) {
        step.command = step.command.replace('[SIM] ', '');
      } else if (step.command && !step.command.startsWith('[SIM]') && enabled) {
        step.command = `[SIM] ${step.command}`;
      }
    }
  }
  return plan;
}
