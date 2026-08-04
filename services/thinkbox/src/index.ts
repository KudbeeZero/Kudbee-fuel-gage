import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces, getWorkspace } from './registry.ts';
import { createMissionGraph } from './planning/planner.ts';
import { extractLearning } from './learning/index.ts';
import { validateCompleteWorkflow } from './integration/validation.ts';
import { generateDemoSession } from './integration/replay.ts';
import { generateDailyReview, computeExcellenceScore } from './excellence/engine.ts';
import { getBestProvider, getAllEvaluations } from './providers/index.ts';
import { getTodaysCosts, generateOptimizations } from './cost/tracker.ts';
import { getEngineeringKPIs, getEngineeringScorecard, verifyEngineeringReady } from './metrics/engineering.ts';
import { buildManifest } from './intelligence/engine.ts';
import { publishWorkspaceEvent } from './events.ts';

const [command, ...args] = process.argv.slice(2);
const arg = args[0];

switch (command) {
  case 'detect': { if (!arg) { console.error('Usage: detect <path>'); process.exit(1); } const o = intakeAndDetect(arg); console.log(JSON.stringify({ workspaceId: o.workspace.workspaceId, name: o.workspace.name, languages: o.workspace.detection?.languages ?? [], confidence: o.workspace.detection?.confidence ?? 0 })); break; }
  case 'plan': { const m = createMissionGraph({ title: arg || 'Default', description: arg || 'Default' }); console.log(JSON.stringify({ epics: m.epics.length, tasks: m.tasks.length, agents: m.requiredAgents.map(a => a.name) })); break; }
  case 'learn': { const m = createMissionGraph({ title: arg || 'Test', description: arg || 'Test' }); const r = extractLearning({ missionGraph: m as any, testResults: [{ name: 'unit', passed: false }] }); console.log(JSON.stringify({ records: r.length, categories: [...new Set(r.map(e => e.category))] })); break; }
  case 'validate': { const r = validateCompleteWorkflow(); console.log(JSON.stringify({ score: r.overallScore, passed: r.passed, failed: r.failed })); break; }
  case 'replay': { const s = generateDemoSession(arg || 'demo'); console.log(JSON.stringify({ sessionId: s.sessionId, frames: s.frames.length })); break; }
  case 'review': { const r = generateDailyReview(); console.log(JSON.stringify({ agents: r.agentReviews.length, quality: r.qualityScore, arch: r.architectureScore, recs: r.topRecommendations.length })); break; }
  case 'score': { const s = computeExcellenceScore(); console.log(JSON.stringify({ total: s.total, grade: s.grade, categories: Object.keys(s.breakdown).length })); break; }
  case 'provider': { const best = getBestProvider(arg || 'architecture'); console.log(JSON.stringify(best)); break; }
  case 'cost': { const c = getTodaysCosts(); const o = generateOptimizations(); console.log(JSON.stringify({ today: c.totalCost, budgetHealth: c.budgetHealth, optimizations: o.length })); break; }
  case 'kpi': { const k = getEngineeringKPIs(); const sc = getEngineeringScorecard(); console.log(JSON.stringify({ ciPassRate: k.ciPassRate, scorecard: sc.total, grade: sc.grade })); break; }
  case 'ready': { const v = verifyEngineeringReady(); console.log(JSON.stringify({ ready: v.ready, score: v.score, checks: v.checks.map(c => c.name) })); break; }
  case 'deps': { if (!arg) { console.error('Usage: deps <workspaceId>'); process.exit(1); } const ws = getWorkspace(arg); if (!ws) { console.error(`Workspace not found: ${arg}`); process.exit(1); } const m = buildManifest(ws); console.log(JSON.stringify(m, null, 2)); publishWorkspaceEvent({ topic: 'workspace:deps-resolved', workspace: ws }); break; }
  case 'list': { for (const w of listWorkspaces()) console.log(`${w.workspaceId}  ${w.name}`); break; }
  default: { console.error('OPS-013 CLI — detect | plan | learn | validate | replay | review | score | provider | cost | kpi | ready | deps | list'); process.exit(1); }
}
