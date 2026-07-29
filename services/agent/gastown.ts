/**
 * services/agent/gastown.ts
 * ---------------------------------------------------------------------------
 * Gastown Manager — THINK-aware meta-agent coordinator.
 *
 * Responsibilities:
 *   1. Load THINK tokens from pgvector on startup for contextual awareness
 *   2. Enhance user prompts with semantically-recalled historical context
 *   3. Delegate to SupervisorOrchestrator for multi-agent task execution
 *   4. Feed all outcomes into DTHINK pipeline for continuous learning
 *   5. Mint new THINK tokens from successful decisions and failure patterns
 *   6. Maintain agent decision log with full audit trail
 *   7. Coordinate with the 10-agent terminal swarm via phone tree
 *
 * The name "Gastown" evokes the idea of fueling AI agents with knowledge
 * — every interaction produces learned context that strengthens the swarm.
 * ---------------------------------------------------------------------------
 */

import { SupervisorOrchestrator } from './orchestrator.js';
import type { TaskResult } from './types.js';

const AGENT_ID = `gastown-manager-${process.pid}`;
const PREFIX = '[GASTOWN]';

// Shell command wrappers — Gastown coordinates the terminal agent swarm
function sh(cmd: string): string {
  try {
    const { execSync } = require('node:child_process');
    return execSync(cmd, { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return '';
  }
}

interface ThinkToken {
  id: string;
  context: string;
  decision: string;
  outcome: string;
  kd: number;
  efficacy: number;
  timestamp: string;
}

interface GastownContext {
  relevantTokens: ThinkToken[];
  swarmStatus: string;
  deploysToday: number;
  knowledgeGraphHealth: string;
  lastDecisions: string[];
}

export class GastownManager {
  private orchestrator: SupervisorOrchestrator;
  private context: GastownContext;
  private decisions: Array<{ id: string; type: string; summary: string; ts: string }>;

  constructor() {
    this.orchestrator = new SupervisorOrchestrator();
    this.context = {
      relevantTokens: [],
      swarmStatus: 'unknown',
      deploysToday: 0,
      knowledgeGraphHealth: 'unknown',
      lastDecisions: [],
    };
    this.decisions = [];
  }

  log(level: string, ...args: unknown[]) {
    const ts = new Date().toISOString();
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const prefix = level === 'ERROR' ? '✗' : level === 'WARN' ? '!' : '→';
    console.log(`${ts} ${PREFIX} ${prefix} ${msg}`);
  }

  // ── Bootstrap: load THINK tokens and swarm context ────────────────────

  async bootstrap(workspaceRoot: string): Promise<void> {
    this.log('INFO', 'Booting Gastown Manager…');

    // 1. Recall relevant THINK tokens from pgvector
    try {
      const { getRelevantThinkTokens } = await import('../memory/vectorStore.js');
      const result = await getRelevantThinkTokens('system operations deployment architecture', 10);
      if (result.ok && result.tokens) {
        this.context.relevantTokens = result.tokens;
        this.log('INFO', `Loaded ${result.tokens.length} THINK tokens from memory`);
      }
    } catch (err) {
      this.log('WARN', 'THINK token load failed (degraded):', String(err));
    }

    // 2. Check swarm status
    try {
      const status = sh('node scripts/agents.mjs status 2>/dev/null');
      this.context.swarmStatus = status.length > 0 ? 'online' : 'degraded';
      this.log('INFO', `Swarm status: ${this.context.swarmStatus}`);
    } catch {
      this.context.swarmStatus = 'offline';
    }

    // 3. Check knowledge graph
    try {
      const health = sh('node scripts/snippet-agent.mjs health 2>/dev/null');
      this.context.knowledgeGraphHealth = health.includes('HEALTHY') ? 'HEALTHY' : 'unknown';
    } catch {
      this.context.knowledgeGraphHealth = 'unknown';
    }

    // 4. Recent deploy history
    try {
      const deployLog = sh('node scripts/deploy-log.mjs status 2>/dev/null');
      if (deployLog) {
        const parsed = JSON.parse(deployLog);
        this.context.deploysToday = parsed.totalDeploys || 0;
      }
    } catch {
      this.context.deploysToday = 0;
    }

    // 5. Recent decisions from DTHINK pipeline
    try {
      const tail = sh('node scripts/dthink-pipeline.mjs tail 5 2>/dev/null');
      if (tail) {
        this.context.lastDecisions = tail.split('\n').filter(Boolean).slice(-5);
      }
    } catch {
      this.context.lastDecisions = [];
    }

    this.log('INFO', 'Context loaded — ready to coordinate');
  }

  // ── Enhance prompt with historical context ───────────────────────────

  private enhancePrompt(userPrompt: string): string {
    const parts: string[] = [userPrompt];

    if (this.context.relevantTokens.length > 0) {
      parts.push('\n\n## Historical Context (from THINK memory)');
      for (const token of this.context.relevantTokens.slice(0, 3)) {
        parts.push(`- ${token.decision || token.context}: ${(token.outcome || '').slice(0, 120)}`);
      }
    }

    if (this.context.lastDecisions.length > 0) {
      parts.push('\n## Recent Swarm Activity');
      for (const d of this.context.lastDecisions.slice(0, 3)) {
        parts.push(`- ${d.slice(0, 120)}`);
      }
    }

    return parts.join('\n');
  }

  // ── Execute task through the orchestrator ────────────────────────────

  async execute(userPrompt: string, workspaceRoot: string): Promise<{
    results: TaskResult[];
    summary: string;
    totalDuration: number;
    thinkContext: GastownContext;
  }> {
    const startTime = Date.now();

    // Log decision
    const decisionId = `gastown-${Date.now()}`;
    this.decisions.push({
      id: decisionId,
      type: 'execute',
      summary: userPrompt.slice(0, 80),
      ts: new Date().toISOString(),
    });

    // Feed into DTHINK pipeline
    try {
      const { execSync } = require('child_process');
      execSync(
        `node scripts/dthink-pipeline.mjs feed "agent:action" "Gastown executing: ${userPrompt.slice(0, 100).replace(/"/g, '\\"')}"`,
        { timeout: 5000 }
      );
    } catch { /* best-effort */ }

    this.log('INFO', `Executing: ${userPrompt.slice(0, 80)}`);

    // Enhance with historical context
    const enhancedPrompt = this.enhancePrompt(userPrompt);

    // Delegate to orchestrator
    const { results, summary, totalDuration } = await this.orchestrator.execute(
      enhancedPrompt,
      workspaceRoot
    );

    // Feed results into DTHINK
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    try {
      const { execSync } = require('child_process');
      execSync(
        `node scripts/dthink-pipeline.mjs feed "agent:decision" "Gastown complete: ${successCount} succeeded, ${failCount} failed, ${totalDuration}ms"`,
        { timeout: 5000 }
      );
    } catch { /* best-effort */ }

    // Mint THINK token from outcome
    if (results.length > 0) {
      await this.mintOutcomeToken(userPrompt, results);
    }

    this.decisions[this.decisions.length - 1] = {
      ...this.decisions[this.decisions.length - 1],
      type: `complete:${successCount}s_${failCount}f`,
      summary: `${userPrompt.slice(0, 60)} → ${successCount}/${results.length} passed`,
    };

    return {
      results,
      summary,
      totalDuration: Date.now() - startTime,
      thinkContext: this.context,
    };
  }

  // ── Mint THINK token from execution outcome ──────────────────────────

  private async mintOutcomeToken(prompt: string, results: TaskResult[]): Promise<void> {
    try {
      const { mintThinkToken } = await import('../memory/thinkTokenGenerator.js');
      const successRate = results.filter((r) => r.success).length / results.length;
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      const tokenStatus = successRate >= 0.8 ? 'VERIFIED' : 'PENDING_APPROVAL';
      const kd = Math.round(successRate * 100);
      const efficacy = Math.min(1, avgDuration < 5000 ? 0.9 : 0.5);

      await mintThinkToken({
        agentId: AGENT_ID,
        taskContext: {
          prompt: prompt.slice(0, 200),
          roleCount: new Set(results.map((r) => r.role)).size,
          resultCount: results.length,
        },
        failedState: results.filter((r) => !r.success).length > 0
          ? { failures: results.filter((r) => !r.success).map((r) => r.role) }
          : {},
        correctionDelta: `Orchestrated ${results.length} tasks, ${successRate * 100}% success rate, avg ${avgDuration.toFixed(0)}ms`,
        reasoningSteps: results.map((r) => `${r.role}:${r.success ? 'PASS' : 'FAIL'}(${r.duration}ms)`),
        status: tokenStatus,
        kd,
        efficacy,
      });

      this.log('INFO', `THINK token minted — kd=${kd}, efficacy=${efficacy}, status=${tokenStatus}`);
    } catch (err) {
      this.log('WARN', 'THINK token mint failed:', String(err));
    }
  }

  // ── Recall: semantic search through THINK tokens ─────────────────────

  async recall(query: string, limit = 5): Promise<ThinkToken[]> {
    try {
      const { getRelevantThinkTokens } = await import('../memory/vectorStore.js');
      const result = await getRelevantThinkTokens(query, limit);
      if (result.ok && result.tokens) {
        return result.tokens;
      }
    } catch (err) {
      this.log('WARN', 'THINK recall failed:', String(err));
    }
    return [];
  }

  // ── Status report ────────────────────────────────────────────────────

  getStatus(): GastownContext & { decisionsTotal: number } {
    return {
      ...this.context,
      decisionsTotal: this.decisions.length,
      lastDecisions: this.decisions.slice(-5).map((d) => `${d.type}: ${d.summary}`),
    };
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  shutdown(): void {
    this.orchestrator.shutdown();
    this.log('INFO', 'Gastown Manager shut down');
  }
}

export default GastownManager;
