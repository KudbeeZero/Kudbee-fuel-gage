/**
 * services/lib/kiloBridgeMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — KiloBridge Token Budget Gate.
 *
 * Enforces per-tenant token budget caps before LLM API calls.
 * Budgets are tracked in Redis with daily/weekly/monthly windows.
 * When a budget is exceeded, returns 429 with retry-after header.
 *
 * Key pattern: kudbee:budget:{tenantId}:daily:{YYYY-MM-DD}
 *
 * Fails open if Redis is unreachable (tokens pass through uncounted).
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from './redis.js';
import { MiddlewareGuard } from './middlewareGuard.ts';

export const budgetGuard = new MiddlewareGuard('kilo-bridge', 3, 30_000);

const DEFAULT_DAILY_BUDGET = 1_000_000;
const BUDGET_KEY_PREFIX = 'kudbee:budget';

function getDailyBudget(): number {
  const env = process.env.TOKEN_BUDGET_DAILY;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_DAILY_BUDGET;
}

function getBudgetWindowKey(tenantId: string, window: 'daily' | 'weekly' | 'monthly'): string {
  const now = new Date();
  let period: string;

  switch (window) {
    case 'daily':
      period = now.toISOString().slice(0, 10);
      break;
    case 'weekly': {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      period = startOfWeek.toISOString().slice(0, 10);
      break;
    }
    case 'monthly':
      period = now.toISOString().slice(0, 7);
      break;
    default:
      period = now.toISOString().slice(0, 10);
  }

  return `${BUDGET_KEY_PREFIX}:${tenantId}:${window}:${period}`;
}

function extractTokenCount(req: Request): number {
  const body = req.body;
  if (!body || typeof body !== 'object') return 0;

  return (
    (typeof body.tokens_in === 'number' ? body.tokens_in : 0) +
    (typeof body.tokens_out === 'number' ? body.tokens_out : 0) +
    (typeof body.input_tokens === 'number' ? body.input_tokens : 0) +
    (typeof body.output_tokens === 'number' ? body.output_tokens : 0) +
    (typeof body.total_tokens === 'number' ? body.total_tokens : 0)
  );
}

function extractTenantId(req: Request): string {
  return (req.headers['x-tenant-id'] as string) ||
    (req.headers['x-agent-id'] as string) ||
    (req as any).agentId ||
    'default';
}

export function kiloBridgeBudget() {
  return budgetGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    const tokenCount = extractTokenCount(req);
    if (tokenCount <= 0) return next();

    const tenantId = extractTenantId(req);
    const dailyBudget = getDailyBudget();
    const dailyKey = getBudgetWindowKey(tenantId, 'daily');

    try {
      const redis = getRedisClient({ label: 'kilo-bridge' });
      if (!redis) return next();

      const currentUsage = await redis.get(dailyKey);
      const used = currentUsage ? parseInt(currentUsage, 10) : 0;

      if (used >= dailyBudget) {
        const ttl = await redis.ttl(dailyKey);
        const retryAfter = ttl > 0 ? ttl : 86400;
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-Token-Budget-Limit', String(dailyBudget));
        res.setHeader('X-Token-Budget-Used', String(used));
        res.setHeader('X-Token-Budget-Remaining', '0');
        return res.status(429).json({
          error: 'token_budget_exceeded',
          message: `Daily token budget of ${dailyBudget.toLocaleString()} exceeded. Retry after ${retryAfter}s.`,
          tenantId,
          used,
          limit: dailyBudget,
        });
      }

      const newUsage = used + tokenCount;
      const pipeline = redis.pipeline();
      pipeline.incrby(dailyKey, tokenCount);
      if (used === 0) {
        pipeline.expire(dailyKey, 86400);
      }
      const results = await pipeline.exec();
      const actualNewUsage = results?.[0]?.[1] ? parseInt(String(results[0][1]), 10) : newUsage;

      res.setHeader('X-Token-Budget-Limit', String(dailyBudget));
      res.setHeader('X-Token-Budget-Used', String(actualNewUsage));
      res.setHeader('X-Token-Budget-Remaining', String(Math.max(0, dailyBudget - actualNewUsage)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[kilo-bridge] FAIL-OPEN: budget check failed — ${msg}`);
    }

    return next();
  });
}

export function getBudgetGuardStats() {
  return budgetGuard.stats();
}

export { getDailyBudget, extractTokenCount, extractTenantId };
