import { getRedisClient } from './redis.js';

const BUDGET_KEY = 'kudbee:budget:spend';
const BUDGET_MONTH_KEY = 'kudbee:budget:month';

export class BudgetExceededError extends Error {
  statusCode = 402;
  constructor(spendUsd: number, budgetUsd: number) {
    super(`Monthly budget exceeded: $${spendUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}`);
    this.name = 'BudgetExceededError';
  }
}

export function getMonthlyBudgetUsd(): number {
  return Number(process.env.MONTHLY_BUDGET_USD ?? 50);
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function ensureMonthKey(): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'budget-gate' });
    const month = currentMonthKey();
    const stored = await redis.get(BUDGET_MONTH_KEY);
    if (stored !== month) {
      await redis.set(BUDGET_MONTH_KEY, month);
      await redis.set(BUDGET_KEY, '0');
    }
  } catch { /* best-effort */ }
}

export async function trackSpend(costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  try {
    await ensureMonthKey();
    const redis = getRedisClient({ label: 'budget-gate' });
    await redis.incrbyfloat(BUDGET_KEY, costUsd.toString());
  } catch { /* best-effort */ }
}

export async function getCurrentSpend(): Promise<number> {
  try {
    await ensureMonthKey();
    const redis = getRedisClient({ label: 'budget-gate' });
    const raw = await redis.get(BUDGET_KEY);
    return raw ? parseFloat(raw) : 0;
  } catch {
    return 0;
  }
}

export async function checkBudgetOrThrow(tokensIn: number, tokensOut: number, model: string): Promise<void> {
  const budgetUsd = getMonthlyBudgetUsd();
  const currentSpend = await getCurrentSpend();
  const estimatedCost = estimateCost(tokensIn, tokensOut, model);
  const projectedTotal = currentSpend + estimatedCost;

  if (projectedTotal > budgetUsd) {
    throw new BudgetExceededError(projectedTotal, budgetUsd);
  }
}

function estimateCost(tokensIn: number, tokensOut: number, model: string): number {
  const per1k: Record<string, { inCost: number; outCost: number }> = {
    'gpt-4o': { inCost: 0.005, outCost: 0.015 },
    'claude-3-5-sonnet': { inCost: 0.003, outCost: 0.015 },
    'gemini-1.5-pro': { inCost: 0.00125, outCost: 0.005 },
    'deepseek-r1': { inCost: 0.00055, outCost: 0.00219 },
    'deepseek-v3': { inCost: 0.00014, outCost: 0.00028 },
    'llama-3.1-8b-instant': { inCost: 0.00005, outCost: 0.00008 },
    'mixtral-8x7b': { inCost: 0.00024, outCost: 0.00024 },
    'llama-3.3-70b': { inCost: 0.00059, outCost: 0.00079 }
  };
  const modelKey = Object.keys(per1k).find((k) => model.toLowerCase().includes(k));
  const rates = modelKey && per1k[modelKey] ? per1k[modelKey] : { inCost: 0.001, outCost: 0.002 };
  return ((tokensIn * rates.inCost) + (tokensOut * rates.outCost)) / 1000;
}

export function estimateGroqCost(tokensUsed: number): number {
  const rate = 0.00005;
  return (tokensUsed * rate) / 1000;
}

export async function getBudgetStatus(): Promise<{
  spendUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  pct: number;
  monthReset: string;
}> {
  const budgetUsd = getMonthlyBudgetUsd();
  const spendUsd = await getCurrentSpend();
  return {
    spendUsd: Math.round(spendUsd * 10000) / 10000,
    budgetUsd,
    remainingUsd: Math.max(0, Math.round((budgetUsd - spendUsd) * 10000) / 10000),
    pct: Math.min(100, Math.round((spendUsd / budgetUsd) * 10000) / 100),
    monthReset: currentMonthKey()
  };
}
