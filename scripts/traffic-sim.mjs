import Redis from 'ioredis';

let redis;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  redis.on('connect', () => console.log('[Sim] Redis connected'));
  redis.on('ready', () => console.log('[Sim] Redis ready'));
  redis.on('error', (err) => console.warn('[Sim] Redis error:', err.message));
  redis.on('reconnecting', (delay) =>
    console.warn(`[Sim] Redis reconnecting in ${delay ?? '?'}ms`)
  );
  redis.on('end', () => console.warn('[Sim] Redis connection closed'));
} catch (err) {
  console.error('[Sim] Failed to initialize Redis client:', err.message);
  redis = null;
}

const MODELS = ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'deepseek-r1', 'deepseek-v3'];
const PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek', 'Cursor'];
const PROJECTS = ['kilo-fuel-gauge', 'frontier-core', 'mesh-globe-3d', 'api-gateway', 'ml-pipeline'];
const STATUSES = ['OK', 'OK', 'OK', 'OK', 'OK', 'TIMEOUT', 'RATE_LIMIT', 'ERROR'];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTelemetry() {
  const isAnomalous = Math.random() < 0.25;
  const model = rand(MODELS);
  const provider = rand(PROVIDERS);
  const projectName = rand(PROJECTS);

  let cost, status, tokensIn, tokensOut;

  if (isAnomalous) {
    cost = Number((Math.random() * 2.0 + 0.1).toFixed(6));
    status = rand(['TIMEOUT', 'RATE_LIMIT', 'ERROR']);
    tokensIn = Math.floor(Math.random() * 5000) + 1000;
    tokensOut = Math.floor(Math.random() * 2000) + 500;
  } else {
    cost = Number((Math.random() * 0.04 + 0.001).toFixed(6));
    status = 'OK';
    tokensIn = Math.floor(Math.random() * 500) + 50;
    tokensOut = Math.floor(Math.random() * 150) + 15;
  }

  return {
    trace_id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost,
    status,
    provider,
    project_name: projectName,
    timestamp: new Date().toISOString()
  };
}

let intervalId = null;

async function pushTelemetry() {
  try {
    let throttleFactor = 1;
    try {
      const raw = await redis.get('kudbee:throttle_factor');
      if (raw) {
        throttleFactor = Math.max(1, parseInt(raw, 10) || 1);
      }
    } catch {
      throttleFactor = 1;
    }

    if (throttleFactor > 1) {
      const delayMs = throttleFactor * 200;
      console.log(`[Sim] Throttle active (factor=${throttleFactor}) — delaying ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const event = generateTelemetry();
    await redis.lpush('kudbee:telemetry_feed', JSON.stringify(event));
    console.log(`[Sim] Pushed: ${event.trace_id} | model=${event.model} | cost=${event.cost} | status=${event.status} | tokens=${event.tokens_in}/${event.tokens_out}`);
  } catch (err) {
    console.error('[Sim] Failed to push telemetry:', err.message);
  }
}

async function shutdown() {
  console.log('\n[Sim] Shutting down gracefully...');
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  try {
    await redis.quit();
    console.log('[Sim] Redis connection closed');
  } catch (err) {
    console.error('[Sim] Error closing Redis:', err.message);
  }
  process.exit(0);
}

async function init() {
  try {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('[Sim] Starting telemetry traffic simulator...');
    console.log('[Sim] Pushing to kudbee:telemetry_feed every 200ms (throttle-aware)');
    console.log('[Sim] Press Ctrl+C to stop\n');

    await pushTelemetry();
    intervalId = setInterval(pushTelemetry, 200);
  } catch (err) {
    console.error('[Sim] Fatal initialization error:', err.message);
    process.exit(1);
  }
}

init();
