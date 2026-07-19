import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000)
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Connection error:', err.message));

const payload = {
  contracts: {
    TelemetryEvent: `z.object({
  trace_id: z.string().min(1),
  model: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  status: z.string().min(1).default('OK'),
  provider: z.string().default('unknown'),
  project_name: z.string().default('kilo-fuel-gauge'),
  timestamp: z.string().optional()
})`,
    GOVERNANCE_ACTION: `z.object({
  id: z.number().int(),
  trace_id: z.string().min(1),
  action: z.string().default('VERIFY'),
  type: z.string().default('GOVERNANCE_ACTION'),
  agent_id: z.string(),
  signature: z.string().min(1),
  signed_payload: z.string(),
  value_score: z.number().min(0).max(100).default(0),
  timestamp: z.string()
})`,
    value_score: `z.object({
  trace_id: z.string().min(1),
  value_score: z.number().min(0).max(100)
})`
  },
  system_state: {
    phases_completed: ['1', '2', '3', '4', '5', '6', '7'],
    summary: 'Phases 1-7 complete. React frontend operational. Ed25519 Web Crypto signing implemented client-side with verification at POST /api/interceptor/verify. Redis persistence active via ioredis: kudbee:telemetry_feed (LPUSH queue, LTRIM 10k) and kudbee:governance_actions (sorted set with timestamp score). Governance feed and community-value metrics read from Redis with SQLite fallback. Dashboard load simulation passes at 35ms latency for Partner Verify (target <200ms).'
  },
  active_directive: 'Initialize Gemini 1.5 Flash agent to continuously pop from kudbee:telemetry_feed, analyze logs, and output strict GOVERNANCE_ACTION payloads.'
};

async function init() {
  try {
    await redis.set('kudbee:system:context', JSON.stringify(payload));
    console.log('[Init] Project memory seeded to kudbee:system:context');
    console.log('[Init] Payload:', JSON.stringify(payload, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[Init] Failed to seed project memory:', err.message);
    process.exit(1);
  }
}

init();
