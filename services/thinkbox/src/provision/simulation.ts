import type { WorkspaceProvisionPlan } from './types.ts';

export interface SimulationResult { plan: WorkspaceProvisionPlan; dryRun: boolean; completedSteps: number; totalSteps: number; estimatedCompletionMs: number; logs: string[]; }

export function runSimulation(plan: WorkspaceProvisionPlan): SimulationResult {
  const logs: string[] = [`[SIM] Provisioning simulation — ${plan.totalSteps} steps`];
  for (const phase of Object.keys(plan.phases)) {
    const steps = plan.phases[phase] ?? [];
    if (steps.length === 0) continue;
    logs.push(`[SIM] Phase: ${phase} (${steps.length} steps)`);
    for (const s of steps) {
      if (s.command) logs.push(`[SIM]   $ ${s.command}`);
      else logs.push(`[SIM]   # ${s.label}`);
    }
  }
  logs.push(`[SIM] Ready Score: ${plan.readyScore.total}/${plan.readyScore.grade}`);
  return { plan, dryRun: true, completedSteps: 0, totalSteps: plan.totalSteps, estimatedCompletionMs: plan.estimatedTotalDurationMs, logs };
}

export function toggleSimulation(plan: WorkspaceProvisionPlan, enabled: boolean): WorkspaceProvisionPlan {
  plan.simulation = enabled;
  return plan;
}
