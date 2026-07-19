import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000)
});

redis.on('connect', () => console.log('[SessionLogger] Redis connected'));
redis.on('error', (err) => console.error('[SessionLogger] Redis error:', err.message));

const prNumber = process.env.PR_NUMBER || 'unknown';
const prTitle = process.env.PR_TITLE || 'Untitled Session';
const prBody = process.env.PR_BODY || '';
const githubSha = process.env.GITHUB_SHA || 'unknown';
const mergedAt = new Date().toISOString();

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
  try {
    await redis.lpush('kudbee:session_history', JSON.stringify(manifest));
    console.log(`[SessionLogger] Logged session ${prNumber} to kudbee:session_history`);
    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error('[SessionLogger] Failed to log session:', err.message);
    process.exit(1);
  }
}

logSession();
