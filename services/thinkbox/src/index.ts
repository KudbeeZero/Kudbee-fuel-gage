/**
 * services/thinkbox/src/index.ts
 *
 * THINKBOX CLI — Detection, Intelligence & Provisioning.
 *
 * Commands:
 *   detect <git-url|zip|directory>
 *   intelligence <workspaceId>
 *   provision <workspaceId> [--no-sim]
 *   list
 */

import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces, getWorkspace } from './registry.ts';
import { buildManifest } from './intelligence/engine.ts';
import { createProvisionPlan } from './provision/planner.ts';
import { runSimulation } from './provision/simulation.ts';

function printManifest(outcome: ReturnType<typeof intakeAndDetect>): void {
  const { workspace, manifestPath } = outcome;
  console.log(JSON.stringify({
    workspaceId: workspace.workspaceId,
    name: workspace.name,
    sourceType: workspace.sourceType,
    state: workspace.state,
    languages: workspace.detection?.languages ?? [],
    frameworks: workspace.detection?.frameworks ?? [],
    packageManagers: workspace.detection?.packageManagers ?? [],
    confidence: workspace.detection?.confidence ?? 0,
    recommendedNextAction: workspace.summary?.recommendedNextAction ?? null,
    manifestPath,
  }, null, 2));
}

const [command, ...args] = process.argv.slice(2);
const arg = args[0];

switch (command) {
  case 'detect': {
    if (!arg) { console.error('Usage: thinkbox detect <git-url|zip|directory>'); process.exit(1); }
    printManifest(intakeAndDetect(arg));
    break;
  }
  case 'intelligence': {
    if (!arg) { console.error('Usage: thinkbox intelligence <workspaceId>'); process.exit(1); }
    const ws = getWorkspace(arg);
    if (!ws) { console.error(`Workspace not found: ${arg}`); process.exit(1); }
    console.log(JSON.stringify(buildManifest(ws, ws.detection), null, 2));
    break;
  }
  case 'provision': {
    if (!arg) { console.error('Usage: thinkbox provision <workspaceId> [--no-sim]'); process.exit(1); }
    const ws = getWorkspace(arg);
    if (!ws) { console.error(`Workspace not found: ${arg}`); process.exit(1); }
    const intel = buildManifest(ws, ws.detection);
    const simulation = !args.includes('--no-sim');
    const plan = createProvisionPlan(intel, simulation);
    if (simulation) {
      const sim = runSimulation(plan);
      sim.logs.forEach(l => process.stderr.write(l + '\n'));
    }
    console.log(JSON.stringify(plan, null, 2));
    break;
  }
  case 'list': {
    for (const w of listWorkspaces()) {
      console.log(`${w.workspaceId}  ${w.name}  [${w.sourceType}]  ${w.state}`);
    }
    break;
  }
  default: {
    console.error(`
THINKBOX — Detection · Intelligence · Provisioning

Commands:
  detect <git-url|zip|directory>       Intake + detect + manifest
  intelligence <workspaceId>           Project Intelligence manifest (PR-002)
  provision <workspaceId> [--no-sim]   Workspace Provision Plan (PR-003)
  list                                 List registered workspaces
`);
    process.exit(1);
  }
}
