declare module './circuitBreaker.js' {
  export class CircuitBreaker {
    name: string;
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMax: number;

    constructor(name: string, config?: { failureThreshold?: number; resetTimeoutMs?: number; halfOpenMax?: number });
    dispose(): void;
    getState(): Promise<'CLOSED' | 'OPEN' | 'HALF_OPEN'>;
    recordFailure(): Promise<void>;
    recordSuccess(): Promise<void>;
    isOpen(): Promise<boolean>;
    allowRequest(): Promise<boolean>;
    forceOpen(): Promise<void>;
    forceReset(): Promise<void>;
  }

  export const groqBreaker: CircuitBreaker;
  export const geminiBreaker: CircuitBreaker;
  export const redisSinkBreaker: CircuitBreaker;
}

export {};
