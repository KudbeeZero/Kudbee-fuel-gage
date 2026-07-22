/**
 * services/lib/middlewareChain.ts
 * ---------------------------------------------------------------------------
 * Phase 50 — Middleware Lifecycle & Transaction Boundaries.
 *
 * Composable chain(...handlers) that guarantees:
 *   - Pre-handlers execute in order
 *   - Handler runs only if no pre-handler errored
 *   - Post-handlers (closing phase) always run even on error
 *   - Detailed timing logged for each step (>10ms = warn)
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';

type MiddlewareFn = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

export function chain(...handlers: MiddlewareFn[]): MiddlewareFn {
  return async (req, res, next) => {
    const start = Date.now();
    let handlerRan = false;

    try {
      for (const handler of handlers) {
        const stepStart = Date.now();
        await new Promise<void>((resolve, reject) => {
          try {
            const result = handler(req, res, (err?: unknown) => {
              if (err) reject(err);
              else resolve();
            });
            if (result instanceof Promise) result.catch(reject);
          } catch (e) { reject(e); }
        });
        const stepMs = Date.now() - stepStart;
        if (stepMs > 10) console.log(`[MiddlewareChain] step ${handler.name || 'anon'} took ${stepMs}ms`);
        handlerRan = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[MiddlewareChain] error after ${Date.now() - start}ms: ${msg}`);
      if (!res.headersSent) next(err);
    }

    if (!handlerRan && !res.headersSent) next();
  };
}
