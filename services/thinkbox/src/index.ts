/**
 * THINKBOX CLI — detect · intelligence · plan · learn · validate · replay · list
 */

import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces, getWorkspace } from './registry.ts';
import { buildManifest } from './intelligence/engine.ts';
import { createMissionGraph } from './planning/planner.ts';
import { createEngineeringGraph, seedEngineeringGraph } from './planning/graph.ts';
import { extractLearning, getLearningFeedback, generateRecommendations } from './learning/index.ts';
import { validateCompleteWorkflow } from './integration/validation.ts';
import { generateDemoSession } from './integration/replay.ts';

const [command, ...args] = process.argv.slice(2);
const arg = args[0];

switch (command) {
  case 'detect': { if (!arg) { console.error('Usage: detect <path>'); process.exit(1); } const o = intakeAndDetect(arg); console.log(JSON.stringify({ workspaceId: o.workspace.workspaceId, name: o.workspace.name, state: o.workspace.state, languages: o.workspace.detection?.languages ?? [], confidence: o.workspace.detection?.confidence ?? 0 })); break; }
  case 'intelligence': { if (!arg) { console.error('Usage: intelligence <id>'); process.exit(1); } const ws = getWorkspace(arg); if (!ws) { console.error('Not found'); process.exit(1); } console.log(JSON.stringify(buildManifest(ws, ws.detection))); break; }
  case 'plan': {
    const obj = arg || 'Default mission';
    const mission = createMissionGraph({ title: obj, description: obj });
    console.log(JSON.stringify({ epics: mission.epics.length, tasks: mission.tasks.length, agents: mission.requiredAgents.map(a => a.name), confidence: Math.round(mission.confidence * 100) }));
    break;
  }
  case 'learn': {
    const obj = arg || 'Test mission';
    const mission = createMissionGraph({ title: obj, description: obj });
    const records = extractLearning({
      missionGraph: mission as any, executionSummary: { totalCommands: 10, successful: 8, failed: 2, errors: ['test'], recommendations: [] },
      testResults: [{ name: 'unit', passed: false }], recoveryEvents: [{ type: 'reconnect', success: true }],
    });
    console.log(JSON.stringify({ records: records.length, recommendations: generateRecommendations({ title: obj, description: obj }).length }));
    break;
  }
  case 'validate': {
    const report = validateCompleteWorkflow();
    console.log(JSON.stringify({ score: report.overallScore, passed: report.passed, failed: report.failed, recommendations: report.recommendations }));
    break;
  }
  case 'replay': {
    const wsId = arg || 'demo-workspace';
    const session = generateDemoSession(wsId);
    console.log(JSON.stringify({ sessionId: session.sessionId, frames: session.frames.length, subsystems: session.metadata.subsystems }));
    break;
  }
  case 'list': { for (const w of listWorkspaces()) console.log(`${w.workspaceId}  ${w.name}  [${w.sourceType}]  ${w.state}`); break; }
  default: { console.error('THINKBOX CLI — detect | intelligence | plan | learn | validate | replay | list'); process.exit(1); }
}
