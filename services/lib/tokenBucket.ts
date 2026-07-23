import { getRedisClient } from './redis.js';

const TB_PREFIX = 'kudbee:token_bucket:';

export class TokenBucket {
  name: string;
  maxTokens: number;
  refillRatePerSecond: number;
  refillIntervalMs: number;

  constructor(name: string, maxTokens: number, refillRatePerSecond: number, refillIntervalMs = 1000) {
    this.name = name;
    this.maxTokens = maxTokens;
    this.refillRatePerSecond = refillRatePerSecond;
    this.refillIntervalMs = refillIntervalMs;
  }

  async tryConsume(tokens = 1): Promise<boolean> {
    try {
      const redis = getRedisClient({ label: 'token-bucket' });
      const now = Date.now();
      const tokensKey = TB_PREFIX + this.name + ':tokens';
      const lastRefillKey = TB_PREFIX + this.name + ':last_refill';

      const lastRefill = parseInt(await redis.get(lastRefillKey) || String(now), 10);
      const elapsed = (now - lastRefill) / 1000;
      const refilled = Math.floor(elapsed * this.refillRatePerSecond);

      if (refilled > 0) {
        const current = parseInt(await redis.get(tokensKey) || String(this.maxTokens), 10);
        const newTokens = Math.min(this.maxTokens, current + refilled);
        await redis.set(tokensKey, String(newTokens));
        await redis.set(lastRefillKey, String(now));
      }

      const available = parseInt(await redis.get(tokensKey) || '0', 10);
      if (available >= tokens) {
        await redis.set(tokensKey, String(available - tokens));
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  async available(): Promise<number> {
    try {
      const redis = getRedisClient({ label: 'token-bucket' });
      return parseInt(await redis.get(TB_PREFIX + this.name + ':tokens') || '0', 10);
    } catch {
      return this.maxTokens;
    }
  }
}

export const groqTokenBucket = new TokenBucket('groq', 30, 5);
export const geminiTokenBucket = new TokenBucket('gemini', 100, 10);
export const neonTokenBucket = new TokenBucket('neon', 100, 20);
