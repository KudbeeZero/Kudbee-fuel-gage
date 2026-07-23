/**
 * services/agent/orchestrator.ts
 * ---------------------------------------------------------------------------
 * SupervisorOrchestrator — the "Group 7" coordinating agent.
 *
 * Accepts a main prompt, decomposes it into a DAG of SubTasks, submits them
 * to the TaskQueue respecting dependency order, and synthesizes a final
 * response once all results are collected.
 */

import { TaskQueue } from './queue';
import type { SubTask, TaskResult, DAGNode, SubAgentRole } from './types';

// ── Keyword → role mapping ─────────────────────────────────────────────────

const KEYWORD_ROLE_MAP: Array<{ keywords: string[]; role: SubAgentRole }> = [
  {
    keywords: ['code', 'implement', 'function', 'class', 'refactor', 'module', 'component', 'logic', 'algorithm', 'pattern', 'architecture', 'design pattern'],
    role: 'CodeAnalyzer',
  },
  {
    keywords: ['security', 'vulnerability', 'auth', 'authentication', 'injection', 'xss', 'csrf', 'encrypt', 'secret', 'safe', 'audit', 'threat', 'exploit', 'valve'],
    role: 'SecurityScanner',
  },
  {
    keywords: ['test', 'unit test', 'coverage', 'jest', 'vitest', 'assert', 'spec', 'mock', 'stub', 'integration test', 'e2e', 'regression'],
    role: 'TestRunner',
  },
  {
    keywords: ['dependency', 'package', 'npm', 'import', 'module resolution', 'version', 'upgrade', 'library', 'compat', 'peer dependency', 'bundle'],
    role: 'DependencyChecker',
  },
  {
    keywords: ['document', 'docs', 'readme', 'jsdoc', 'comment', 'explain', 'description', 'api docs', 'reference'],
    role: 'DocumentationGenerator',
  },
  {
    keywords: ['typescript', 'type', 'interface', 'generic', 'strict', 'tsconfig', 'declaration', 'narrowing', 'infer', 'annotation', 'type error', 'ts', '.ts'],
    role: 'TypescriptValidator',
  },
];

// ── DAG dependency rules ───────────────────────────────────────────────────

/**
 * Defines which roles depend on which other roles.
 * format: [dependent] → [required predecessor]
 */
const DEPENDENCY_RULES: Array<[SubAgentRole, SubAgentRole]> = [
  ['SecurityScanner', 'CodeAnalyzer'],        // Security scan needs code analysis first
  ['TestRunner', 'CodeAnalyzer'],              // Tests need code structure understanding
  ['TestRunner', 'TypescriptValidator'],       // Tests need type validation
  ['DocumentationGenerator', 'CodeAnalyzer'],  // Docs need code understanding
  ['DependencyChecker', 'CodeAnalyzer'],       // Dependency audit needs code context
];

export class SupervisorOrchestrator {
  private queue: TaskQueue;

  constructor(poolSize?: number) {
    this.queue = new TaskQueue(poolSize);
  }

  // ── Main entry point ──────────────────────────────────────────────────

  async execute(mainPrompt: string, workspaceRoot: string): Promise<{
    results: TaskResult[];
    summary: string;
    totalDuration: number;
  }> {
    const startTime = Date.now();

    // 1. Decompose prompt into a DAG of sub-tasks
    const dag = this.decomposePrompt(mainPrompt, workspaceRoot);

    if (dag.length === 0) {
      return {
        results: [],
        summary: 'No sub-agents matched the prompt. Try a more specific request.',
        totalDuration: Date.now() - startTime,
      };
    }

    console.log(`\n[Supervisor] Decomposed prompt into ${dag.length} sub-tasks across ${new Set(dag.map((n) => n.task.role)).size} roles\n`);

    // 2. Execute DAG respecting dependencies
    const results = await this.executeDAG(dag);

    // 3. Synthesize final response
    const totalDuration = Date.now() - startTime;
    const summary = this.synthesize(results, mainPrompt);

    return { results, summary, totalDuration };
  }

  // ── Prompt decomposition ──────────────────────────────────────────────

  private decomposePrompt(prompt: string, workspaceRoot: string): DAGNode[] {
    const lowerPrompt = prompt.toLowerCase();
    const matchedRoles = new Set<SubAgentRole>();

    // Always include CodeAnalyzer as the foundation for complex prompts
    const isComplex = lowerPrompt.split(/\s+/).length > 10 || /analyze|refactor|review|audit|implement|build|create/.test(lowerPrompt);

    // Match keywords to roles
    for (const { keywords, role } of KEYWORD_ROLE_MAP) {
      if (keywords.some((kw) => lowerPrompt.includes(kw))) {
        matchedRoles.add(role);
      }
    }

    // Fallback: if nothing matched, use CodeAnalyzer as default
    if (matchedRoles.size === 0) {
      matchedRoles.add('CodeAnalyzer');
    }

    // For complex prompts, ensure CodeAnalyzer is included as the root
    if (isComplex && !matchedRoles.has('CodeAnalyzer')) {
      matchedRoles.add('CodeAnalyzer');
    }

    const roles = Array.from(matchedRoles);
    const nodes: DAGNode[] = [];
    const taskIdMap = new Map<SubAgentRole, string>();

    // Create sub-task for each matched role
    for (const role of roles) {
      const taskId = `task-${role}-${Date.now().toString(36)}-${nodes.length}`;
      taskIdMap.set(role, taskId);

      const subTask: SubTask = {
        id: taskId,
        role,
        prompt: this.buildRolePrompt(role, prompt),
        context: { workspaceRoot },
      };

      nodes.push({
        task: subTask,
        dependencies: [],
        status: 'pending',
      });
    }

    // Apply dependency rules between the matched roles
    for (const [dependent, predecessor] of DEPENDENCY_RULES) {
      const depId = taskIdMap.get(dependent);
      const predId = taskIdMap.get(predecessor);
      if (depId && predId) {
        const depNode = nodes.find((n) => n.task.id === depId);
        if (depNode && !depNode.dependencies.includes(predId)) {
          depNode.dependencies.push(predId);
        }
      }
    }

    return nodes;
  }

  /**
   * Build a role-specific prompt that augments the user's original prompt
   * with role-appropriate instructions.
   */
  private buildRolePrompt(role: SubAgentRole, userPrompt: string): string {
    const roleInstructions: Record<SubAgentRole, string> = {
      CodeAnalyzer: `Analyze the following code-related request from a structural and architectural perspective. Identify patterns, potential issues, and provide actionable recommendations:\n\n${userPrompt}`,
      SecurityScanner: `Conduct a thorough security review of the following. Identify vulnerabilities, unsafe coding patterns, and recommend mitigations following OWASP guidelines:\n\n${userPrompt}`,
      TestRunner: `Evaluate the testing requirements for the following. Design appropriate test strategies, identify edge cases, and recommend testing approaches:\n\n${userPrompt}`,
      DependencyChecker: `Audit the dependency implications of the following. Check for compatibility issues, license concerns, and version management best practices:\n\n${userPrompt}`,
      DocumentationGenerator: `Generate comprehensive documentation for the following. Cover purpose, usage, API surface, and any relevant examples:\n\n${userPrompt}`,
      TypescriptValidator: `Validate the TypeScript aspects of the following. Check type safety, interface design, generic usage, and strict-mode compliance:\n\n${userPrompt}`,
    };

    return roleInstructions[role];
  }

  // ── DAG execution ─────────────────────────────────────────────────────

  private async executeDAG(dag: DAGNode[]): Promise<TaskResult[]> {
    const completed = new Map<string, TaskResult>();
    const failed = new Map<string, Error>();
    const nodeMap = new Map(dag.map((n) => [n.task.id, n]));

    // Keep processing until all nodes are resolved
    while (completed.size + failed.size < dag.length) {
      // Find nodes ready to execute (all dependencies satisfied)
      const readyNodes = dag.filter((node) => {
        if (node.status !== 'pending') return false;
        return node.dependencies.every((depId) => completed.has(depId) || failed.has(depId));
      });

      if (readyNodes.length === 0 && completed.size + failed.size < dag.length) {
        // Stuck — remaining nodes have unsatisfied dependencies due to failures
        // Mark them as failed and break
        for (const node of dag) {
          if (node.status === 'pending') {
            node.status = 'failed';
            const hasFailedDep = node.dependencies.some((depId) => failed.has(depId));
            if (hasFailedDep) {
              console.warn(`[Supervisor] Skipping ${node.task.id} (${node.task.role}): dependency failed`);
            }
          }
        }
        break;
      }

      console.log(`[Supervisor] Dispatching ${readyNodes.length} ready task(s):`, readyNodes.map((n) => `${n.task.id} (${n.task.role})`).join(', '));

      // Submit all ready tasks in parallel
      const promises = readyNodes.map(async (node) => {
        node.status = 'queued';

        try {
          node.status = 'running';
          const result = await this.queue.enqueue(node.task);
          node.status = 'completed';
          completed.set(node.task.id, result);
          console.log(`[Supervisor] ✓ ${node.task.id} (${node.task.role}) completed in ${result.duration}ms`);
          return result;
        } catch (err: unknown) {
          node.status = 'failed';
          const error = err instanceof Error ? err : new Error(String(err));
          failed.set(node.task.id, error);

          const errorResult: TaskResult = {
            taskId: node.task.id,
            role: node.task.role,
            success: false,
            output: '',
            duration: 0,
            error: error.message,
          };
          completed.set(node.task.id, errorResult);
          console.error(`[Supervisor] ✗ ${node.task.id} (${node.task.role}) failed: ${error.message}`);
          return errorResult;
        }
      });

      // Wait for all in-flight tasks to settle
      await Promise.allSettled(promises);
    }

    // Return results in DAG order
    return dag.map((node) => {
      const result = completed.get(node.task.id);
      return (
        result ?? {
          taskId: node.task.id,
          role: node.task.role,
          success: false,
          output: '',
          duration: 0,
          error: 'Skipped: dependency failed',
        }
      );
    });
  }

  // ── Synthesis ─────────────────────────────────────────────────────────

  private synthesize(results: TaskResult[], originalPrompt: string): string {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const lines: string[] = [
      `# Multi-Agent Analysis Summary`,
      ``,
      `**Original Prompt:** ${originalPrompt}`,
      ``,
      `**Results:** ${successful.length} succeeded, ${failed.length} failed`,
      ``,
    ];

    if (failed.length > 0) {
      lines.push(`## Failures`);
      for (const f of failed) {
        lines.push(`- **${f.role}**: ${f.error ?? 'Unknown error'}`);
      }
      lines.push(``);
    }

    lines.push(`## Agent Outputs`);
    for (const r of successful) {
      lines.push(`### ${r.role} (${r.duration}ms)`);
      lines.push(r.output.slice(0, 500)); // Truncate long outputs
      if (r.thinking) {
        lines.push(`\n<details><summary>Thinking trace</summary>\n\n\`\`\`\n${r.thinking.slice(0, 300)}\n\`\`\`\n</details>`);
      }
      lines.push(``);
    }

    return lines.join('\n');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  shutdown(): void {
    this.queue.shutdown();
  }
}
