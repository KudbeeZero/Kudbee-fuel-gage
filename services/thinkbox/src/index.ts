/**
 * THINKBOX CLI — detect · plan · learn · validate · replay · review · score · list
 */

import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces } from './registry.ts';
import { createMissionGraph } from './planning/planner.ts';
import { extractLearning, generateRecommendations } from './learning/index.ts';
import { validateCompleteWorkflow } from './integration/validation.ts';
import { generateDemoSession } from './integration/replay.ts';
import { generateDailyReview, computeExcellenceScore } from './excellence/engine.ts';

const [command, ...args] = process.argv.slice(2);
const arg = args[0];

switch (command) {
  case 'detect': {
    if (!arg) { console.error('Usage: detect <path>'); process.exit(1); }
    const o = intakeAndDetect(arg);
    console.log(JSON.stringify({ workspaceId: o.workspace.workspaceId, name: o.workspace.name, state: o.workspace.state, languages: o.workspace.detection?.languages ?? [], confidence: o.workspace.detection?.confidence ?? 0 }));
    break;
  }
  case 'plan': {
    const obj = arg || 'Default mission';
    const m = createMissionGraph({ title: obj, description: obj });
    console.log(JSON.stringify({ epics: m.epics.length, tasks: m.tasks.length, agents: m.requiredAgents.map(a => a.name), confidence: Math.round(m.confidence * 100) }));
    break;
  }
  case 'learn': {
    const obj = arg || 'Test mission';
    const m = createMissionGraph({ title: obj, description: obj });
    const r = extractLearning({ missionGraph: m as any, testResults: [{ name: 'unit', passed: false }] });
    console.log(JSON.stringify({ records: r.length, categories: [...new Set(r.map(e => e.category))] }));
    break;
  }
  case 'validate': {
    const r = validateCompleteWorkflow();
    console.log(JSON.stringify({ score: r.overallScore, passed: r.passed, failed: r.failed }));
    break;
  }
  case 'replay': {
    const s = generateDemoSession(arg || 'demo');
    console.log(JSON.stringify({ sessionId: s.sessionId, frames: s.frames.length, subsystems: s.metadata.subsystems }));
    break;
  }
  case 'review': {
    const r = generateDailyReview();
    console.log(JSON.stringify({ date: r.date, agents: r.agentReviews.length, qualityScore: r.qualityScore, architectureScore: r.architectureScore, recommendations: r.topRecommendations.length }));
    break;
  }
  case 'score': {
    const s = computeExcellenceScore();
    console.log(JSON.stringify({ total: s.total, grade: s.grade, trend: s.trend, categories: Object.keys(s.breakdown).length }));
    break;
  }
  case 'list': {
    for (const w of listWorkspaces()) console.log(`${w.workspaceId}  ${w.name}  [${w.sourceType}]  ${w.state}`);
    break;
  }
  default: {
    console.error('THINKBOX CLI — detect | plan | learn | validate | replay | review | score | list');
    process.exit(1);
  }
}
