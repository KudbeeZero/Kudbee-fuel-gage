import Redis from 'ioredis';

const prNumber = process.env.PR_NUMBER || 'unknown';
const prTitle = process.env.PR_TITLE || 'Untitled Session';
const prBody = process.env.PR_BODY || '';
const githubSha = process.env.GITHUB_SHA || 'unknown';
const mergedAt = new Date().toISOString();
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Basic sanity check so a malformed/old REDIS_URL (e.g. an Upstash URI leaked
// into CI secrets) fails fast instead of throwing a fatal URI parse error or
// retrying forever. A non-critical telemetry script must never break the
// pipeline.
function isValidRedisUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'redis:' || u.protocol === 'rediss:';
  } catch {
    return false;
  }
}

function extractStruggles(body) {
  const match = body.match(/### Struggles & Friction([\s\S]*?)(?=\n### |\Z)/i);
  if (!match) return [];
  const lines = match[1].split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
  return lines.length > 0 ? lines : [match[1].trim()];
}

const struggles = extractStruggles(prBody);

const manifest = {
  pr_number: Number(prNumber),
  pr_title: prTitle,
  pr_body: prBody.slice(0, 500),
  github_sha: githubSha,
  merged_at: mergedAt,
  struggles_encountered: struggles,
  lesson_learned: `Session ${prNumber}: ${prTitle}. Implementation completed and merged into main. Future agents should review the diff summary and deployment outcome to understand the architectural changes introduced in this session.`,
  diff_summary: 'Session manifest generated automatically by GitHub Actions on PR merge.'
};

async function logSession() {
  if (!isValidRedisUrl(REDIS_URL)) {
    console.warn('[SessionLogger] Skipping session log: Redis connection failed or REDIS_URL is invalid.');
    return;
  }

  let redis;
  try {
    // lazyConnect + maxRetriesPerRequest:0 means a fatal/unreachable URI will
    // not infinitely retry. We connect once and bail on failure.
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });

    redis.on('error', (err) => console.warn('[SessionLogger] Redis error:', err.message));

    await redis.connect();
    await redis.lpush('kudbee:session_history', JSON.stringify(manifest));
    console.log(`[SessionLogger] Logged session ${prNumber} to kudbee:session_history`);
  } catch (err) {
    console.warn('[SessionLogger] Skipping session log: Redis connection failed or REDIS_URL is invalid.');
    return;
  } finally {
    try { await redis?.quit(); } catch { /* ignore */ }
  }
}

try {
  await logSession();
} catch (err) {
  console.warn('[SessionLogger] Skipping session log: unexpected error —', err?.message || err);
} finally {
  // Always exit 0 so a dropped telemetry log never fails the CI pipeline.
  process.exit(0);
}
