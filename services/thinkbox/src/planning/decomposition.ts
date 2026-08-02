/**
 * THINKBOX PR-007 — Task Decomposition
 *
 * Automatically decomposes an objective into epics → features → tasks → subtasks.
 * Every level includes description, inputs, outputs, definition of done, required
 * tests, risk, suggested agent, and estimated duration.
 */

import crypto from 'node:crypto';
import type { MissionObjective, Epic, Task } from './types.ts';

function tid(): string { return crypto.randomUUID().slice(0, 8); }

const DECOMPOSITION_PATTERNS: Array<{
  keywords: string[];
  epics: Array<{ title: string; description: string; tasks: Array<{ title: string; description: string; suggestedAgent: string; risk: Task['risk']; complexity: Task['complexity'] }> }>;
}> = [
  { keywords: ['api', 'rest', 'endpoint', 'graphql'], epics: [
    { title: 'API Design', description: 'Define API contracts, schemas, and routes',
      tasks: [
        { title: 'Design API schema', description: 'Define OpenAPI/GraphQL schema', suggestedAgent: 'FORGE', risk: 'low', complexity: 'simple' },
        { title: 'Implement route handlers', description: 'Create route handlers with validation', suggestedAgent: 'FORGE', risk: 'low', complexity: 'moderate' },
        { title: 'Write API tests', description: 'Integration tests for all endpoints', suggestedAgent: 'GATE', risk: 'low', complexity: 'moderate' },
        { title: 'Add authentication middleware', description: 'Implement auth guards on routes', suggestedAgent: 'GATE', risk: 'medium', complexity: 'moderate' },
        { title: 'Document API', description: 'Generate API documentation', suggestedAgent: 'JOURNAL', risk: 'low', complexity: 'simple' },
      ]
    },
  ]},
  { keywords: ['database', 'migration', 'schema', 'model'], epics: [
    { title: 'Database Design', description: 'Design schema, migrations, and models',
      tasks: [
        { title: 'Design database schema', description: 'Define tables, relationships, indexes', suggestedAgent: 'DTHINK', risk: 'medium', complexity: 'complex' },
        { title: 'Write migrations', description: 'Create migration files', suggestedAgent: 'FORGE', risk: 'medium', complexity: 'moderate' },
        { title: 'Create models', description: 'Implement ORM models', suggestedAgent: 'FORGE', risk: 'low', complexity: 'moderate' },
        { title: 'Seed test data', description: 'Create seed scripts for development', suggestedAgent: 'FORGE', risk: 'low', complexity: 'simple' },
        { title: 'Test migrations', description: 'Verify migration up/down rollback', suggestedAgent: 'GATE', risk: 'medium', complexity: 'moderate' },
      ]
    },
  ]},
  { keywords: ['frontend', 'ui', 'component', 'page', 'style'], epics: [
    { title: 'UI Implementation', description: 'Build frontend components and pages',
      tasks: [
        { title: 'Create component library', description: 'Build reusable UI components', suggestedAgent: 'FORGE', risk: 'low', complexity: 'moderate' },
        { title: 'Implement pages', description: 'Create page layouts and routing', suggestedAgent: 'FORGE', risk: 'low', complexity: 'moderate' },
        { title: 'Add state management', description: 'Implement state management layer', suggestedAgent: 'DTHINK', risk: 'medium', complexity: 'complex' },
        { title: 'Write component tests', description: 'Unit tests for all components', suggestedAgent: 'GATE', risk: 'low', complexity: 'moderate' },
        { title: 'Accessibility audit', description: 'Check ARIA labels and keyboard nav', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
      ]
    },
  ]},
  { keywords: ['deploy', 'ci', 'pipeline', 'build', 'release'], epics: [
    { title: 'CI/CD Pipeline', description: 'Build and deployment automation',
      tasks: [
        { title: 'Configure CI pipeline', description: 'Set up build, test, lint stages', suggestedAgent: 'FORGE', risk: 'low', complexity: 'moderate' },
        { title: 'Set up deployment', description: 'Configure deploy to staging/prod', suggestedAgent: 'FORGE', risk: 'high', complexity: 'complex' },
        { title: 'Add health checks', description: 'Implement health endpoints', suggestedAgent: 'GATE', risk: 'medium', complexity: 'simple' },
        { title: 'Configure rollback', description: 'Set up automated rollback', suggestedAgent: 'FORGE', risk: 'high', complexity: 'moderate' },
        { title: 'Test deployment', description: 'Verify deployment pipeline end-to-end', suggestedAgent: 'GATE', risk: 'medium', complexity: 'moderate' },
      ]
    },
  ]},
  { keywords: ['test', 'testing', 'coverage', 'e2e'], epics: [
    { title: 'Test Suite', description: 'Comprehensive test coverage',
      tasks: [
        { title: 'Write unit tests', description: 'Unit tests for business logic', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
        { title: 'Write integration tests', description: 'Integration tests for APIs', suggestedAgent: 'GATE', risk: 'low', complexity: 'moderate' },
        { title: 'Write E2E tests', description: 'End-to-end tests for critical paths', suggestedAgent: 'GATE', risk: 'low', complexity: 'complex' },
        { title: 'Set up coverage reporting', description: 'Configure coverage thresholds', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
        { title: 'Fix failing tests', description: 'Address any existing test failures', suggestedAgent: 'FORGE', risk: 'medium', complexity: 'moderate' },
      ]
    },
  ]},
  { keywords: ['performance', 'optimize', 'speed', 'memory'], epics: [
    { title: 'Performance Optimization', description: 'Improve system performance',
      tasks: [
        { title: 'Profile application', description: 'Identify performance bottlenecks', suggestedAgent: 'DTHINK', risk: 'low', complexity: 'moderate' },
        { title: 'Optimize queries', description: 'Add indexes, optimize SQL', suggestedAgent: 'FORGE', risk: 'medium', complexity: 'complex' },
        { title: 'Add caching', description: 'Implement cache layer for hot paths', suggestedAgent: 'FORGE', risk: 'medium', complexity: 'moderate' },
        { title: 'Benchmark improvements', description: 'Measure before/after metrics', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
      ]
    },
  ]},
  { keywords: ['security', 'vulnerability', 'auth', 'secret'], epics: [
    { title: 'Security Hardening', description: 'Address security concerns',
      tasks: [
        { title: 'Audit dependencies', description: 'Check for known vulnerabilities', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
        { title: 'Rotate secrets', description: 'Update and rotate all secrets', suggestedAgent: 'KILOH', risk: 'high', complexity: 'moderate' },
        { title: 'Add rate limiting', description: 'Implement rate limiting on APIs', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
        { title: 'Security scan', description: 'Run SAST and dependency scans', suggestedAgent: 'GATE', risk: 'medium', complexity: 'simple' },
      ]
    },
  ]},
];

const DEFAULT_EPIC: typeof DECOMPOSITION_PATTERNS[0]['epics'][0] = {
  title: 'Implementation',
  description: 'Core implementation work',
  tasks: [
    { title: 'Plan approach', description: 'Research and plan implementation', suggestedAgent: 'KILOH', risk: 'low', complexity: 'simple' },
    { title: 'Implement core logic', description: 'Write core implementation', suggestedAgent: 'FORGE', risk: 'medium', complexity: 'complex' },
    { title: 'Write tests', description: 'Create test suite for new code', suggestedAgent: 'GATE', risk: 'low', complexity: 'moderate' },
    { title: 'Review and document', description: 'Code review and documentation', suggestedAgent: 'GATE', risk: 'low', complexity: 'simple' },
    { title: 'Integration test', description: 'Verify end-to-end integration', suggestedAgent: 'GATE', risk: 'medium', complexity: 'moderate' },
  ],
};

export function decomposeObjective(
  objective: MissionObjective,
  workspaceIntel?: { languages: string[]; frameworks: string[]; services: any[]; dependencies: any[] },
): { epics: Epic[]; tasks: Task[] } {
  const lowerTitle = objective.title.toLowerCase();
  const lowerDesc = objective.description.toLowerCase();
  const combined = `${lowerTitle} ${lowerDesc}`;

  let matchedEpics: typeof DECOMPOSITION_PATTERNS[0]['epics'] = [];

  for (const pattern of DECOMPOSITION_PATTERNS) {
    if (pattern.keywords.some(k => combined.includes(k))) {
      matchedEpics.push(...pattern.epics);
    }
  }

  if (matchedEpics.length === 0) {
    matchedEpics = [DEFAULT_EPIC];
  } else if (matchedEpics.length > 3) {
    matchedEpics = matchedEpics.slice(0, 3);
  }

  const epics: Epic[] = [];
  const tasks: Task[] = [];
  let prevTaskId: string | null = null;

  let epicIdx = 0;
  for (const epicDef of matchedEpics) {
    epicIdx++;
    const epicId = tid();
    const epicTasks: Task[] = [];

    for (const taskDef of epicDef.tasks) {
      const task: Task = {
        id: tid(),
        missionId: objective.id,
        epicId,
        parentId: prevTaskId,
        title: taskDef.title,
        description: taskDef.description,
        inputs: workspaceIntel?.languages ?? [],
        outputs: ['code', 'tests', 'documentation'],
        definitionOfDone: ['Tests pass', 'Code reviewed', 'Documented'],
        requiredTests: ['unit', 'integration'],
        risk: taskDef.risk,
        complexity: taskDef.complexity,
        estimatedDurationMs: taskDef.complexity === 'complex' ? 7200000 : taskDef.complexity === 'moderate' ? 3600000 : 1800000,
        suggestedAgent: taskDef.suggestedAgent,
        assignedAgent: null,
        assignedConfidence: 0,
        status: 'queued',
        dependsOn: prevTaskId ? [prevTaskId] : [],
        blocks: [],
        filesInvolved: [],
        confidence: 0.7,
      };
      epicTasks.push(task);
      prevTaskId = task.id;
    }

    const epic: Epic = {
      id: epicId,
      missionId: objective.id,
      title: epicDef.title,
      description: epicDef.description,
      tasks: epicTasks,
      status: 'draft',
      priority: objective.priority,
      confidence: 0.7,
    };

    epics.push(epic);
    tasks.push(...epicTasks);
  }

  for (let i = 1; i < tasks.length; i++) {
    if (tasks[i].dependsOn.length === 0) {
      tasks[i].dependsOn = [tasks[i - 1].id];
    }
  }

  return { epics, tasks };
}
