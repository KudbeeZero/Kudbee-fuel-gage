/**
 * OPS-013 — Cost Intelligence Tracker
 *
 * Every engineering action carries cost metadata. Tracks session cost,
 * mission cost, agent cost, provider cost, workspace cost, daily budget,
 * and monthly projections. Generates optimization recommendations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CostEntry {
  id: string;
  timestamp: string;
  category: 'provider' | 'agent' | 'mission' | 'workspace';
  providerId: string | null;
  agentId: string | null;
  missionId: string | null;
  workspaceId: string | null;
  tokensUsed: number;
  costUsd: number;
  description: string;
}

export interface CostSummary {
  date: string;
  totalCost: number;
  byCategory: Record<string, number>;
  byProvider: Record<string, number>;
  byAgent: Record<string, number>;
  byMission: Record<string, number>;
  sessionCost: number;
  dailyBudget: number;
  monthlyProjection: number;
  budgetRemaining: number;
  budgetHealth: 'green' | 'yellow' | 'red';
}

export interface CostOptimization {
  recommendation: string;
  estimatedSavingsUsd: number;
  confidence: number;
  evidence: string;
}

const COST_DIR = join(process.cwd(), '.kilo', 'memory', 'costs');
mkdirSync(COST_DIR, { recursive: true });

const COST_PER_1K_TOKENS: Record<string, number> = {
  'deepseek': 0.002,
  'openai': 0.010,
  'anthropic': 0.015,
  'groq': 0.001,
  'google': 0.005,
  'local': 0,
};

function today(): string { return new Date().toISOString().split('T')[0]; }
function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function saveJson(path: string, data: unknown): void { writeFileSync(path, JSON.stringify(data, null, 2), 'utf8'); }

export function recordCost(entry: Omit<CostEntry, 'id'>): CostEntry {
  const full: CostEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...entry };
  const path = join(COST_DIR, `costs-${today()}.json`);
  const entries = loadJson<CostEntry[]>(path, []);
  entries.push(full);
  saveJson(path, entries);
  return full;
}

export function getTodaysCosts(): CostSummary {
  const path = join(COST_DIR, `costs-${today()}.json`);
  const entries = loadJson<CostEntry[]>(path, []);

  const byCategory: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byMission: Record<string, number> = {};
  let totalCost = 0;

  for (const e of entries) {
    totalCost += e.costUsd;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.costUsd;
    if (e.providerId) byProvider[e.providerId] = (byProvider[e.providerId] ?? 0) + e.costUsd;
    if (e.agentId) byAgent[e.agentId] = (byAgent[e.agentId] ?? 0) + e.costUsd;
    if (e.missionId) byMission[e.missionId] = (byMission[e.missionId] ?? 0) + e.costUsd;
  }

  const dailyBudget = 1.0;
  const budgetRemaining = Math.max(0, dailyBudget - totalCost);
  const budgetHealth = budgetRemaining > dailyBudget * 0.5 ? 'green' : budgetRemaining > dailyBudget * 0.2 ? 'yellow' : 'red';
  const monthlyProjection = totalCost * 30;

  return {
    date: today(), totalCost, byCategory, byProvider, byAgent, byMission,
    sessionCost: totalCost, dailyBudget, monthlyProjection,
    budgetRemaining, budgetHealth,
  };
}

export function generateOptimizations(): CostOptimization[] {
  const summary = getTodaysCosts();
  const opts: CostOptimization[] = [];

  // Identify most expensive provider
  let maxProvider = '';
  let maxCost = 0;
  for (const [p, c] of Object.entries(summary.byProvider)) {
    if (c > maxCost) { maxCost = c; maxProvider = p; }
  }
  if (maxProvider && maxCost > 0.1) {
    opts.push({
      recommendation: `Evaluate alternative providers for ${maxProvider} — $${maxCost.toFixed(3)} today`,
      estimatedSavingsUsd: maxCost * 0.3,
      confidence: 0.7,
      evidence: `${maxProvider} has highest cost at $${maxCost.toFixed(3)}`,
    });
  }

  // Budget health warning
  if (summary.budgetHealth !== 'green') {
    opts.push({
      recommendation: 'Budget nearing limit — consider prioritizing mission cost per task',
      estimatedSavingsUsd: summary.totalCost * 0.2,
      confidence: 0.85,
      evidence: `Budget: $${summary.totalCost.toFixed(3)} of $${summary.dailyBudget.toFixed(2)} (${Math.round((summary.totalCost / summary.dailyBudget) * 100)}%)`,
    });
  }

  return opts;
}

export function getCostHistory(days: number = 7): Array<{ date: string; cost: number }> {
  const history: Array<{ date: string; cost: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const path = join(COST_DIR, `costs-${d}.json`);
    const entries = loadJson<CostEntry[]>(path, []);
    history.push({ date: d, cost: entries.reduce((s, e) => s + e.costUsd, 0) });
  }
  return history;
}
