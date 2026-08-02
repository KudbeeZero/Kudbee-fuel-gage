import crypto from 'node:crypto';
import type { WorkspaceProvisionPlan } from '../provision/types.ts';
import type { ExecutionPlan, ExecutionCommand, ApprovalRequest, ExecutionSummary } from './types.ts';

export * from './types.ts';

export function provisionToExecutionPlan(plan: WorkspaceProvisionPlan, sim = true): ExecutionPlan {
  const cmds: ExecutionCommand[] = [];
  for (const [, steps] of Object.entries(plan.phases)) {
    for (const s of steps as any[]) {
      cmds.push({
        id: crypto.randomUUID().slice(0, 6), description: s.label, category: s.phase === 'deploy' ? 'deploy' : s.phase === 'build' ? 'build' : s.phase === 'dependency_install' ? 'install' : 'scan',
        risk: s.risk === 'high' ? 'high' : s.risk === 'medium' ? 'medium' : s.risk === 'low' ? 'low' : 'none',
        command: sim ? `[SIM] ${s.command ?? s.label}` : s.command, args: [], workingDir: null, estimatedDurationMs: s.estimatedDurationMs,
        requiresApproval: s.phase === 'deploy' ? 'administrator' : s.phase === 'dependency_install' ? 'user' : 'automatic',
        rollbackCommand: null, status: 'queued', output: null, exitCode: null, startedAt: null, completedAt: null, retryCount: 0, maxRetries: 3, agentId: null, dependsOn: [],
      });
    }
  }
  const pid = crypto.randomUUID().slice(0, 8);
  const summary: ExecutionSummary = { workspaceId: plan.workspaceId, totalCommands: cmds.length, successful: 0, failed: 0, cancelled: 0, rolledBack: 0, totalDurationMs: 0, riskSummary: { none: 0, low: 0, medium: 0, high: 0, critical: 0 }, approvalSummary: { automatic: { requested: 0, approved: 0, rejected: 0 }, user: { requested: 0, approved: 0, rejected: 0 }, administrator: { requested: 0, approved: 0, rejected: 0 } }, modifiedFiles: [], errors: [], recommendations: [] };
  const approvals: ApprovalRequest[] = cmds.filter(c => c.requiresApproval !== 'automatic').map(c => ({ id: crypto.randomUUID().slice(0, 8), commandId: c.id, commandDescription: c.description, level: c.requiresApproval, category: c.category, risk: c.risk, rollbackAvailable: false, reason: c.description, status: 'pending', requestedAt: new Date().toISOString(), respondedAt: null, respondedBy: null }));
  return { workspaceId: plan.workspaceId, planId: pid, generatedAt: new Date().toISOString(), commands: cmds, simulation: sim, queue: { workspaceId: plan.workspaceId, planId: pid, commands: cmds, status: 'idle', currentCommandId: null, startedAt: null, completedAt: null, totalCount: cmds.length, completedCount: 0, failedCount: 0, estimatedTotalMs: plan.estimatedTotalDurationMs }, pendingApprovals: approvals, summary };
}

export function executeNextCommand(_p: any) { return null; }
export function completeCommand(_p: any, _r: any) {}
export function createApprovalGate(c: any): any { return { id: 'a1', commandId: c.id, commandDescription: c.description, level: c.requiresApproval, category: c.category, risk: c.risk, rollbackAvailable: false, reason: c.description, status: 'pending', requestedAt: new Date().toISOString(), respondedAt: null, respondedBy: null }; }
export function approveRequest(r: any, by: string): any { r.status = 'approved'; return r; }
export function rejectRequest(r: any, by: string): any { r.status = 'rejected'; return r; }
export function evaluateApproval(_c: any) { return { canAutoApprove: true, requiresUserApproval: false, requiresAdminApproval: false }; }
export function getPendingApprovals(r: any[]) { return r.filter((a: any) => a.status === 'pending'); }
export function getApprovalStats(r: any[]) { return { total: r.length, pending: 0, approved: 0, rejected: 0, byLevel: { automatic: { pending: 0, approved: 0, rejected: 0 }, user: { pending: 0, approved: 0, rejected: 0 }, administrator: { pending: 0, approved: 0, rejected: 0 } } }; }
export function analyzeFailure(_p: any, _c: any, _e: string) { return [{ type: 'retry' as const, commandId: 'c1', description: 'Retry', recommended: true }]; }
export function retryCommand(c: any) { return c; }
export function recoverSession(_p: any) { return { recoverable: true, failedCommands: [], recommendations: [] }; }
export function createRollbackPlan(_p: any) { return []; }
export function executeRollback(a: any) { return a; }
export function rollbackAll(_p: any) { return []; }
export function registerProvider(_p: any) {}
export function unregisterProvider(_id: string) {}
export function getProvider(_id: string) { return undefined; }
export function listProviders(_kind?: string) { return []; }
export function getProviderStatus() { return []; }
