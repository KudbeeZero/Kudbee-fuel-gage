import { getRedisClient } from './redis.js';
import crypto from 'node:crypto';

const TB_PREFIX = 'kudbee:token_bucket:';

// Lua: atomic consume — reads, refills, checks, decrements in one roundtrip.
// KEYS[1] = tokens key, KEYS[2] = last_refill key
// ARGV[1] = now (epoch ms), ARGV[2] = max tokens, ARGV[3] = refill rate/s,
// ARGV[4] = tokens to consume
// Returns: 1 = consumed, 0 = denied, -1 = error
const ATOMIC_CONSUME_SCRIPT = `
local tokens_key = KEYS[1]
local refill_key = KEYS[2]
local now = tonumber(ARGV[1])
local max_tokens = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])
local request = tonumber(ARGV[4])

local current = tonumber(redis.call('GET', tokens_key)) or max_tokens
local last_refill = tonumber(redis.call('GET', refill_key)) or now

local elapsed = (now - last_refill) / 1000
local refilled = math.floor(elapsed * refill_rate)

if refilled > 0 then
  current = math.min(max_tokens, current + refilled)
  redis.call('SET', refill_key, now)
end

if current >= request then
  redis.call('SET', tokens_key, current - request)
  redis.call('EXPIRE', tokens_key, 3600)
  redis.call('EXPIRE', refill_key, 3600)
  return 1
end

redis.call('SET', tokens_key, current)
redis.call('EXPIRE', tokens_key, 3600)
return 0
`;

// Lua: atomic read — returns current token count with refill applied.
// KEYS[1] = tokens key, KEYS[2] = last_refill key
// ARGV[1] = now, ARGV[2] = max tokens, ARGV[3] = refill rate/s
const ATOMIC_AVAILABLE_SCRIPT = `
local tokens_key = KEYS[1]
local refill_key = KEYS[2]
local now = tonumber(ARGV[1])
local max_tokens = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])

local current = tonumber(redis.call('GET', tokens_key)) or max_tokens
local last_refill = tonumber(redis.call('GET', refill_key)) or now

local elapsed = (now - last_refill) / 1000
local refilled = math.floor(elapsed * refill_rate)

return math.min(max_tokens, current + refilled)
`;

const CONSUME_SCRIPT_SHA = crypto.createHash('sha1').update(ATOMIC_CONSUME_SCRIPT).digest('hex');
const AVAILABLE_SCRIPT_SHA = crypto.createHash('sha1').update(ATOMIC_AVAILABLE_SCRIPT).digest('hex');

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
      const tokensKey = TB_PREFIX + this.name + ':tokens';
      const refillKey = TB_PREFIX + this.name + ':last_refill';

      const result = await redis.eval(
        ATOMIC_CONSUME_SCRIPT,
        2,
        tokensKey,
        refillKey,
        String(Date.now()),
        String(this.maxTokens),
        String(this.refillRatePerSecond),
        String(tokens)
      ) as number;

      if (result === -1) return true;
      return result === 1;
    } catch {
      return true;
    }
  }

  async available(): Promise<number> {
    try {
      const redis = getRedisClient({ label: 'token-bucket' });
      const tokensKey = TB_PREFIX + this.name + ':tokens';
      const refillKey = TB_PREFIX + this.name + ':last_refill';

      const result = await redis.eval(
        ATOMIC_AVAILABLE_SCRIPT,
        2,
        tokensKey,
        refillKey,
        String(Date.now()),
        String(this.maxTokens),
        String(this.refillRatePerSecond)
      ) as number;

      return Number.isFinite(result) ? result : this.maxTokens;
    } catch {
      return this.maxTokens;
    }
  }
}

export const groqTokenBucket = new TokenBucket('groq', 30, 5);
export const geminiTokenBucket = new TokenBucket('gemini', 100, 10);
export const neonTokenBucket = new TokenBucket('neon', 100, 20);
