import { getRedisClient } from '../lib/redis.js';
import crypto from 'node:crypto';
import { registerShutdown } from '../lib/shutdown.js';

const redis = getRedisClient({ label: 'monitor-agent' });

registerShutdown('monitor-agent', redis);

const AGENT_ID = `monitor-agent-${process.pid}`;
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

console.log(`[Agent] Identity generated: ${AGENT_ID}`);
console.log(`[Agent] Public key: ${publicKey.slice(0, 32)}...`);

let systemContext = null;

const ROLLING_WINDOW_MS = 60_000;
const FAILURE_RATE_THRESHOLD = 0.5;
const RECOVERY_THRESHOLD = 0.2;
const rollingWindow = [];

async function loadSystemContext() {
  try {
    const raw = await redis.get('kudbee:system:context');
    if (!raw) {
      console.warn('[Agent] kudbee:system:context not found — running with defaults');
      return null;
    }
    systemContext = JSON.parse(raw);
    console.log('[Agent] System context loaded');
    console.log(`[Agent] Active directive: ${systemContext.active_directive}`);
    return systemContext;
  } catch (err) {
    console.error('[Agent] Failed to load system context:', err.message);
    return null;
  }
}

function mockAnalyze(telemetry) {
  const cost = Number(telemetry.cost) || 0;
  const status = String(telemetry.status || 'OK');
  const tokensIn = Number(telemetry.tokens_in) || 0;
  const tokensOut = Number(telemetry.tokens_out) || 0;

  const COST_THRESHOLD = 0.05;
  const TOKEN_RATIO_THRESHOLD = 10;

  const tokenRatio = tokensOut > 0 ? tokensIn / tokensOut : tokensIn;

  if (status !== 'OK' || cost > COST_THRESHOLD || tokenRatio > TOKEN_RATIO_THRESHOLD) {
    const severity = cost > COST_THRESHOLD ? 'high' : 'medium';
    return {
      value_score: Math.max(0, Math.floor(Math.random() * 30)),
      note: `Anomaly detected: status=${status}, cost=${cost.toFixed(4)}, token_ratio=${tokenRatio.toFixed(2)}`,
      severity
    };
  }

  return {
    value_score: Math.floor(70 + Math.random() * 30),
    note: 'Normal telemetry profile',
    severity: 'low'
  };
}

function signPayload(privateKey, payload) {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64');
}

function pruneWindow() {
  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  while (rollingWindow.length > 0 && rollingWindow[0].timestamp < cutoff) {
    rollingWindow.shift();
  }
}

function checkFailureRate() {
  pruneWindow();

  const total = rollingWindow.length;
  if (total === 0) return;

  const failures = rollingWindow.filter((entry) => entry.isFailure).length;
  const rate = failures / total;

  if (rate > FAILURE_RATE_THRESHOLD) {
    const alert = {
      timestamp: Date.now(),
      severity: 'CRITICAL',
      message: 'Sustained Telemetry Failure Rate > 50%'
    };

    redis
      .lpush('kudbee:alerts', JSON.stringify(alert))
      .then(() => console.log(`[Alert] CRITICAL alert pushed: failure rate=${(rate * 100).toFixed(1)}%`))
      .catch((err) => console.error('[Alert] Failed to push alert:', err.message));

    redis.set('kudbee:throttle_factor', '5').catch((err) => console.error('[Throttle] Failed to set throttle:', err.message));

    selfHeal();
  } else if (rate < RECOVERY_THRESHOLD) {
    redis.del('kudbee:throttle_factor').then(() => {
      console.log(`[Throttle] Failure rate recovered to ${(rate * 100).toFixed(1)}% — throttle removed`);
    }).catch((err) => console.error('[Throttle] Failed to remove throttle:', err.message));
  }
}

async function selfHeal() {
  console.log('[Agent] Attempting self-healing...');
}

async function processTelemetry(telemetry) {
  try {
    const analysis = mockAnalyze(telemetry);
    const traceId = String(telemetry.trace_id || `unknown-${Date.now()}`);
    const isFailure = String(telemetry.status || 'OK') !== 'OK';

    rollingWindow.push({ timestamp: Date.now(), isFailure });

    const governanceAction = {
      trace_id: traceId,
      action: 'VERIFY',
      type: 'GOVERNANCE_ACTION',
      agent_id: AGENT_ID,
      signature: '',
      signed_payload: '',
      value_score: analysis.value_score,
      note: analysis.note,
      timestamp: new Date().toISOString()
    };

    const payloadToSign = JSON.stringify({
      trace_id: governanceAction.trace_id,
      action: governanceAction.action,
      type: governanceAction.type,
      value_score: governanceAction.value_score,
      timestamp: governanceAction.timestamp
    });

    governanceAction.signed_payload = payloadToSign;
    governanceAction.signature = signPayload(privateKey, payloadToSign);

    const score = Date.now();
    await redis.zadd('kudbee:governance_actions', score, JSON.stringify(governanceAction));
    await redis.sadd('kudbee:verified_traces', traceId);
    await redis.incrbyfloat('kudbee:community_value_score', analysis.value_score);
    await redis.incr('kudbee:governance_count');

    console.log(`[Agent] Processed trace ${traceId} | score=${analysis.value_score} | severity=${analysis.severity}`);

    checkFailureRate();
  } catch (err) {
    console.error('[Agent] Failed to process telemetry:', err.message);
  }
}

async function runLoop() {
  console.log('[Agent] Starting polling loop...');
  console.log('[Agent] Listening on kudbee:telemetry_feed');

  while (true) {
    try {
      const result = await redis.blpop('kudbee:telemetry_feed', 0);
      if (!result) continue;

      const [, raw] = result;
      let telemetry;
      try {
        telemetry = JSON.parse(raw);
      } catch {
        console.error('[Agent] Failed to parse telemetry payload');
        continue;
      }

      await processTelemetry(telemetry);
    } catch (err) {
      console.error('[Agent] Polling loop error:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function init() {
  try {
    await loadSystemContext();
    await runLoop();
  } catch (err) {
    console.error('[Agent] Fatal initialization error:', err.message);
    process.exit(1);
  }
}

init();
