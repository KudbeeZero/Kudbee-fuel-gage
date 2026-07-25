export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

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
  type: 'OPENED' | 'CLOSED' | 'HALF_OPEN' | 'FAILURE' | 'SUCCESS';
  providerId: string;
  timestamp: string;
  state: CircuitState;
  failureCount: number;
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

  private emit(type: 'OPENED' | 'CLOSED' | 'HALF_OPEN' | 'FAILURE' | 'SUCCESS'): void {
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
}
