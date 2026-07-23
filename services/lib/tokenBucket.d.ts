declare module './tokenBucket.js' {
  export class TokenBucket {
    name: string;
    maxTokens: number;
    refillRatePerSecond: number;
    refillIntervalMs: number;

    constructor(name: string, maxTokens: number, refillRatePerSecond: number, refillIntervalMs?: number);
    tryConsume(tokens?: number): Promise<boolean>;
    available(): Promise<number>;
  }

  export const groqTokenBucket: TokenBucket;
  export const geminiTokenBucket: TokenBucket;
  export const neonTokenBucket: TokenBucket;
}

export {};
