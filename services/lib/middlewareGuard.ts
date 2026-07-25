/**
 * middlewareGuard.ts — Self-healing middleware circuit breaker
 * ---------------------------------------------------------------------------
 * Wraps Express middleware handlers with fail-open semantics, health
 * tracking, and automatic circuit breaking. If a middleware fails N
 * consecutive times, it auto-bypasses for a cooldown period (30s) then
 * re-enables. All middleware states are exposed via getStats().
 *
 * Usage:
 *   const guard = new MiddlewareGuard('rate-limiter', 5, 30_000);
 *   app.use(guard.wrap(async (req, res, next) => { ... }));
 */

export interface MiddlewareStats {
  name: string;
  healthy: boolean;
  failureCount: number;
  consecutiveFailures: number;
  successCount: number;
  bypassedCount: number;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  state: 'ACTIVE' | 'DEGRADED' | 'BYPASSED';
}

export class MiddlewareGuard {
  name: string;
  private threshold: number;
  private cooldownMs: number;
  private failures: number;
  private consecutive: number;
  private successes: number;
  private bypassed: number;
  private lastFailureAt: string | null;
  private cooldownUntil: number;
  private healthy: boolean;

  constructor(name: string, threshold = 5, cooldownMs = 30_000) {
    this.name = name;
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.failures = 0;
    this.consecutive = 0;
    this.successes = 0;
    this.bypassed = 0;
    this.lastFailureAt = null;
    this.cooldownUntil = 0;
    this.healthy = true;
  }

  /**
   * Wraps an Express middleware handler with automatic error
   * recovery. Never throws — always calls next().
   */
  wrap(
    fn: (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => Promise<void> | void
  ) {
    return async (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => {
      if (!this.healthy && Date.now() < this.cooldownUntil) {
        this.bypassed += 1;
        return next();
      }

      try {
        await fn(req, res, next);
        this.consecutive = 0;
        this.successes += 1;
        if (!this.healthy && Date.now() >= this.cooldownUntil) {
          this.healthy = true;
          console.log(`[MiddlewareGuard:${this.name}] Circuit re-closed — middleware active`);
        }
      } catch (err) {
        this.failures += 1;
        this.consecutive += 1;
        this.lastFailureAt = new Date().toISOString();
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[MiddlewareGuard:${this.name}] FAIL-OPEN: error in middleware — passing through. Error: ${msg}`);

        if (this.consecutive >= this.threshold) {
          this.healthy = false;
          this.cooldownUntil = Date.now() + this.cooldownMs;
          console.error(
            `[MiddlewareGuard:${this.name}] CIRCUIT OPEN — ${this.consecutive} consecutive failures. Bypassing for ${this.cooldownMs / 1000}s`
          );
        }

        next();
      }
    };
  }

  stats(): MiddlewareStats {
    return {
      name: this.name,
      healthy: this.healthy,
      failureCount: this.failures,
      consecutiveFailures: this.consecutive,
      successCount: this.successes,
      bypassedCount: this.bypassed,
      lastFailureAt: this.lastFailureAt,
      cooldownUntil: this.cooldownUntil > Date.now()
        ? new Date(this.cooldownUntil).toISOString()
        : null,
      state: this.healthy ? 'ACTIVE' : (Date.now() < this.cooldownUntil ? 'BYPASSED' : 'DEGRADED')
    };
  }

  reset(): void {
    this.failures = 0;
    this.consecutive = 0;
    this.successes = 0;
    this.bypassed = 0;
    this.lastFailureAt = null;
    this.cooldownUntil = 0;
    this.healthy = true;
  }
}

const _registry: MiddlewareGuard[] = [];

export function registerGuard(guard: MiddlewareGuard): void {
  _registry.push(guard);
}

export function getAllGuardStats(): MiddlewareStats[] {
  return _registry.map((g) => g.stats());
}
