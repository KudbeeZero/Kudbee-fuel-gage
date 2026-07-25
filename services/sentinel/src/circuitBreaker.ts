export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'QUOTA_EXCEEDED';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests?: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
  openedAt: number | null;
  halfOpenRequests: number;
}

export type CircuitBreakerEventCallback = (event: {
  type: 'OPENED' | 'CLOSED' | 'HALF_OPEN' | 'FAILURE' | 'SUCCESS' | 'UPSTASH_QUOTA_EXCEEDED' | 'QUOTA_RESET_ESTIMATED';
  providerId: string;
  timestamp: string;
  state: CircuitState;
  failureCount: number;
  quotaResetEstimateMs?: number;
}) => void;

export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitBreakerState;
  private providerId: string;
  private listeners: CircuitBreakerEventCallback[];

  constructor(providerId: string, config: CircuitBreakerConfig) {
    this.providerId = providerId;
    this.config = {
      failureThreshold: config.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs,
      halfOpenMaxRequests: config.halfOpenMaxRequests ?? 3
    };
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureAt: null,
      openedAt: null,
      halfOpenRequests: 0
    };
    this.listeners = [];
  }

  get currentState(): CircuitState {
    return this.state.state;
  }

  get failureCount(): number {
    return this.state.failureCount;
  }

  onEvent(cb: CircuitBreakerEventCallback): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(type: 'OPENED' | 'CLOSED' | 'HALF_OPEN' | 'FAILURE' | 'SUCCESS' | 'UPSTASH_QUOTA_EXCEEDED'): void {
    const event = {
      type,
      providerId: this.providerId,
      timestamp: new Date().toISOString(),
      state: this.state.state,
      failureCount: this.state.failureCount
    };
    for (const cb of this.listeners) {
      try { cb(event); } catch { /* ignore */ }
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state.state === 'OPEN') {
      const elapsed = now - (this.state.openedAt ?? now);
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state.state = 'HALF_OPEN';
        this.state.halfOpenRequests = 0;
        this.emit('HALF_OPEN');
      } else {
        throw new Error(
          `Circuit breaker OPEN for ${this.providerId} — reset in ${Math.round((this.config.resetTimeoutMs - elapsed) / 1000)}s`
        );
      }
    }

    if (this.state.state === 'HALF_OPEN' && this.state.halfOpenRequests >= this.config.halfOpenMaxRequests) {
      throw new Error(`Circuit breaker HALF_OPEN limit reached for ${this.providerId}`);
    }

    if (this.state.state === 'HALF_OPEN') {
      this.state.halfOpenRequests += 1;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.state.failureCount = 0;
    this.state.lastFailureAt = null;
    if (this.state.state === 'HALF_OPEN') {
      this.state.state = 'CLOSED';
      this.state.openedAt = null;
      this.emit('CLOSED');
    }
    this.emit('SUCCESS');
  }

  private onFailure(): void {
    this.state.failureCount += 1;
    this.state.lastFailureAt = Date.now();
    this.emit('FAILURE');

    if (this.state.failureCount >= this.config.failureThreshold) {
      this.state.state = 'OPEN';
      this.state.openedAt = Date.now();
      this.emit('OPENED');
    }
  }

  reset(): void {
    this.state = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureAt: null,
      openedAt: null,
      halfOpenRequests: 0
    };
    this.emit('CLOSED');
  }

  getState(): Readonly<CircuitBreakerState> {
    return { ...this.state };
  }

  /**
   * Activates the UPSTASH_QUOTA_EXCEEDED state. Unlike OPEN (which uses
   * a fixed resetTimeoutMs), QUOTA_EXCEEDED estimates the reset window
   * based on the Upstash monthly billing cycle (resets at the start of
   * the next hour or next calendar month boundary).
   */
  triggerQuotaExceeded(): void {
    this.state.state = 'QUOTA_EXCEEDED';
    this.state.openedAt = Date.now();
    const resetEstimate = this.estimateQuotaReset();
    this.emit('UPSTASH_QUOTA_EXCEEDED');

    const event = {
      type: 'QUOTA_RESET_ESTIMATED' as const,
      providerId: this.providerId,
      timestamp: new Date().toISOString(),
      state: this.state.state,
      failureCount: this.state.failureCount,
      quotaResetEstimateMs: resetEstimate
    };
    for (const cb of this.listeners) {
      try { cb(event); } catch { /* ignore */ }
    }
  }

  /**
   * Estimates the remaining time until the Upstash quota resets.
   * For hourly rate limits: resets at the top of the next hour.
   * For monthly limits: resets at the start of the next month.
   * Falls back to 60 minutes if the cycle cannot be determined.
   */
  estimateQuotaReset(): number {
    const now = new Date();
    const hourEnd = new Date(now);
    hourEnd.setHours(hourEnd.getHours() + 1, 0, 0, 0);
    const msUntilHourEnd = hourEnd.getTime() - now.getTime();

    if (msUntilHourEnd <= 3600_000) {
      return msUntilHourEnd;
    }

    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const msUntilMonthEnd = monthEnd.getTime() - now.getTime();

    if (msUntilMonthEnd <= 31 * 86400_000) {
      return msUntilMonthEnd;
    }

    return 3600_000;
  }

  /**
   * Checks if outbound telemetry should be silenced due to quota exhaustion.
   */
  shouldSilenceTelemetry(): boolean {
    if (this.state.state !== 'QUOTA_EXCEEDED') return false;
    const elapsed = Date.now() - (this.state.openedAt ?? 0);
    const resetEstimate = this.estimateQuotaReset();
    return elapsed < resetEstimate;
  }
}
