/**
 * THINKBOX CLI — detect · intelligence · provision · execute · plan · list
 */

import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces, getWorkspace } from './registry.ts';
import { buildManifest } from './intelligence/engine.ts';
import { createMissionGraph } from './planning/planner.ts';
import { createEngineeringGraph, seedEngineeringGraph } from './planning/graph.ts';

function printDetect(outcome: ReturnType<typeof intakeAndDetect>): void {
  const { workspace, manifestPath } = outcome;
  console.log(JSON.stringify({ workspaceId: workspace.workspaceId, name: workspace.name, sourceType: workspace.sourceType, state: workspace.state, languages: workspace.detection?.languages ?? [], frameworks: workspace.detection?.frameworks ?? [], packageManagers: workspace.detection?.packageManagers ?? [], confidence: workspace.detection?.confidence ?? 0, recommendedNextAction: workspace.summary?.recommendedNextAction ?? null, manifestPath }));
}

const [command, ...args] = process.argv.slice(2);
const arg = args[0];

switch (command) {
  case 'detect': { if (!arg) { console.error('Usage: detect <path>'); process.exit(1); } printDetect(intakeAndDetect(arg)); break; }
  case 'intelligence': { if (!arg) { console.error('Usage: intelligence <id>'); process.exit(1); } const ws = getWorkspace(arg); if (!ws) { console.error('Not found'); process.exit(1); } console.log(JSON.stringify(buildManifest(ws, ws.detection))); break; }
  case 'plan': {
    const objectiveText = arg || 'Improve test coverage and add API documentation';
    const ws = getWorkspace(arg) ?? listWorkspaces()[0];
    const intel = ws ? buildManifest(ws, ws.detection) : undefined;
    const mission = createMissionGraph({ title: objectiveText, description: objectiveText }, intel as any);
    const eng = createEngineeringGraph() as any;
    seedEngineeringGraph(eng, intel?.workspaceId ?? 'unknown');
    console.log(JSON.stringify({ mission, engineeringGraph: { nodes: eng.nodes, edges: eng.edges } }));
    break;
  }
  case 'list': { for (const w of listWorkspaces()) console.log(`${w.workspaceId}  ${w.name}  [${w.sourceType}]  ${w.state}`); break; }
  default: { console.error('THINKBOX CLI — detect | intelligence | plan | list'); process.exit(1); }
}
