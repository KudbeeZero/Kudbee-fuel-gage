import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MEMORY_ROOT = path.resolve(__dirname, '..', '.kilo', 'memory');
const DECISIONS_DIR = path.join(MEMORY_ROOT, 'decisions');

let { compactTrajectory } = await import('./think-compact.mjs').catch(() => ({
  compactTrajectory: (p) => ({ compacted: p, beforeTokens: 0, afterTokens: 0, savingsPct: 0 }),
}));

function runCIQuery(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15000, env: { ...process.env, GH_PAGER: '' } });
  } catch {
    return null;
  }
}

function fetchCIStatus() {
  const raw = runCIQuery('gh run list --limit 10 --json name,status,conclusion,headBranch,event,createdAt,url');
  if (!raw) return { runs: [], error: 'gh CLI unavailable' };
  try {
    const data = JSON.parse(raw);
    return {
      runs: (data || []).map((r) => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.headBranch,
        event: r.event,
        createdAt: r.createdAt,
        url: r.url,
      })),
      total: (data || []).length,
      failures: (data || []).filter((r) => r.conclusion === 'failure').length,
      successes: (data || []).filter((r) => r.conclusion === 'success').length,
    };
  } catch (e) {
    return { runs: [], error: e.message };
  }
}

function getCIHealth() {
  const status = fetchCIStatus();
  const latest = status.runs[0];
  const recentFailures = status.runs.filter((r) => r.conclusion === 'failure').slice(0, 5);

  return {
    timestamp: new Date().toISOString(),
    overall: status.failures === 0 ? 'HEALTHY' : status.failures <= 2 ? 'DEGRADED' : 'UNSTABLE',
    latestRun: latest
      ? {
          name: latest.name,
          conclusion: latest.conclusion,
          branch: latest.branch,
          event: latest.event,
        }
      : null,
    stats: {
      total: status.total,
      passed: status.successes,
      failed: status.failures,
      passRate: status.total > 0 ? Math.round((status.successes / status.total) * 100) : 0,
    },
    recentFailures: recentFailures.map((r) => ({
      name: r.name,
      branch: r.branch,
      event: r.event,
      url: r.url,
    })),
    source: 'gh-cli',
  };
}

function recordCIThink(health) {
  const now = Date.now();
  const result = compactTrajectory(health);

  const ciFile = path.join(MEMORY_ROOT, `think_ci_${now}.json`);
  try {
    fs.mkdirSync(path.dirname(ciFile), { recursive: true });
    fs.writeFileSync(ciFile, JSON.stringify(result, null, 2));
  } catch {}

  const quality = health.overall === 'HEALTHY'
    ? 'OPTIMAL'
    : health.overall === 'DEGRADED'
      ? 'PARTIAL'
      : 'ESCALATED';

  const dpoFile = path.join(DECISIONS_DIR, `dpo_ci_${quality.toLowerCase()}_${now}.json`);
  try {
    fs.mkdirSync(path.dirname(dpoFile), { recursive: true });
    fs.writeFileSync(
      dpoFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        recommendation: quality === 'OPTIMAL' ? 'CHOSEN' : 'REJECTED',
        trajectory_quality: quality,
        health: result.compacted,
        metadata: { source: 'ci-monitor', category: 'ci_health' },
      }, null, 2)
    );
  } catch {}

  console.log(
    `[ci-monitor] CI ${health.overall} | ${health.stats.passed}/${health.stats.total} passed (${health.stats.passRate}%) | DPO: ${quality}`
  );

  return result;
}

const args = process.argv.slice(2);
if (args[0] === '--watch' || args[0] === '--daemon') {
  const intervalMs = parseInt(args[1]) || 60000;
  console.log(`[ci-monitor] CI daemon started — polling every ${intervalMs}ms`);

  const tick = () => {
    const health = getCIHealth();
    console.log(`${health.timestamp.slice(11, 19)} CI: ${health.overall} | ${health.stats.passed}/${health.stats.total} passed`);
    recordCIThink(health);
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  process.on('SIGINT', () => { clearInterval(timer); process.exit(0); });
  process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
} else {
  const health = getCIHealth();
  console.log(JSON.stringify(health, null, 2));
  recordCIThink(health);
}

export { getCIHealth, recordCIThink, fetchCIStatus };
