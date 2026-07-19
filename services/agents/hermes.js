/**
 * services/agents/hermes.js
 * ---------------------------------------------------------------------------
 * HERMES — the "Autonomous Logic Auditor".
 *
 * HERMES continuously inspects the Redis memory layer for:
 *   1. Inefficiencies in the persistent memory (redundant / overlapping
 *      session logs, duplicate governance actions, bloated feeds).
 *   2. Unoptimized prompt/logic pairs that could be tagged and promoted into
 *      the "Proven" index so the Governance router can serve them on the
 *      Fast-Brain path instead of paying for Slow-Brain LLM reasoning.
 *
 * All HERMES background output is funneled through a custom log formatter so
 * that every action appears in the Control Tower terminal with a
 * `[HERMES:AUDITOR]` prefix.
 *
 * HERMES exposes:
 *   - hermes.runAudit()           -> one audit pass (used by the worker loop)
 *   - hermes.log(...)             -> prefixed logger
 *   - hermes.publishHeartbeat()   -> reports status to the Control Tower
 * ---------------------------------------------------------------------------
 */

import { getRedisClient } from '../lib/redis.js';
import { matchLogic, proposeAction, listProposed } from '../governance/router.js';

const AGENT_ID = `hermes-auditor-${process.pid}`;
const PREFIX = '[HERMES:AUDITOR]';
const HEARTBEAT_KEY = 'kudbee:agents:hermes';
const HEARTBEAT_TTL = 30; // seconds — window the Control Tower treats as "Online"
const LOG_STREAM_KEY = 'kudbee:hermes:log'; // surfaced in the dashboard terminal
const LOG_STREAM_MAX = 200;

// --- Custom log formatter -------------------------------------------------
// Every HERMES background action is rendered with the [HERMES:AUDITOR] prefix
// (plus an optional sub-tag) so it is visually distinct in the dashboard dock.
// Each formatted line is also mirrored to the Redis log stream so the
// Control Tower terminal can display HERMES output in real time.
function format(level, parts) {
  const ts = new Date().toISOString();
  const head = `${PREFIX} ${level}`;
  const body = parts
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
  return `${ts} ${head} ${body}`;
}

async function mirrorToStream(line) {
  try {
    const redis = getRedisClient({ label: 'hermes' });
    await redis.lpush(LOG_STREAM_KEY, JSON.stringify({ ts: new Date().toISOString(), line }));
    await redis.ltrim(LOG_STREAM_KEY, 0, LOG_STREAM_MAX);
  } catch {
    /* best-effort; never block the audit loop on log mirroring */
  }
}

export const log = Object.freeze({
  info: (...parts) => { const l = format('INFO', parts); console.log(l); void mirrorToStream(l); },
  warn: (...parts) => { const l = format('WARN', parts); console.warn(l); void mirrorToStream(l); },
  audit: (...parts) => { const l = format('AUDIT', parts); console.log(l); void mirrorToStream(l); },
  error: (...parts) => { const l = format('ERROR', parts); console.error(l); void mirrorToStream(l); }
});

/**
 * Reports a heartbeat to the Control Tower so the global status bar can show
 * HERMES as "Online" / "Offline". We publish both:
 *   - a Redis key with a short TTL (the authoritative source for the status bar),
 *   - a POST to /api/health (best-effort) when APP_URL is configured.
 *
 * The Control Tower reads `kudbee:agents:hermes` and treats a missing/expired
 * key as Offline. The worker also pushes this on a fixed interval.
 */
export async function publishHeartbeat() {
  const redis = getRedisClient({ label: 'hermes' });
  const payload = {
    agent: 'HERMES',
    status: 'Online',
    pid: process.pid,
    timestamp: new Date().toISOString()
  };
  try {
    await redis.set(HEARTBEAT_KEY, JSON.stringify(payload), 'EX', HEARTBEAT_TTL);
  } catch (err) {
    log.error('heartbeat write failed:', err.message);
  }

  const appUrl = process.env.APP_URL || '';
  if (appUrl) {
    try {
      await fetch(`${appUrl.replace(/\/$/, '')}/api/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'HERMES', status: 'Online' })
      });
    } catch {
      /* best-effort; ignore network errors */
    }
  }
}

export async function reportOffline() {
  const redis = getRedisClient({ label: 'hermes' });
  try {
    await redis.set(
      HEARTBEAT_KEY,
      JSON.stringify({ agent: 'HERMES', status: 'Offline', timestamp: new Date().toISOString() }),
      'EX',
      HEARTBEAT_TTL
    );
  } catch {
    /* ignore */
  }
}

// --- Audit routines -------------------------------------------------------

/**
 * Detect redundant / overlapping session logs in the persistent memory layer.
 * Two session-history entries are "overlapping" when they carry the same
 * agent/trace signature or an identical summary hash, which wastes memory and
 * pollutes recall.
 */
async function auditMemoryLayer(redis) {
  const findings = [];
  try {
    const raw = await redis.lrange('kudbee:session_history', 0, -1);
    const seen = new Map();
    let duplicates = 0;
    const parsed = raw.map((r) => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);

    for (const entry of parsed) {
      const key = entry.trace_id || entry.sessionId || entry.summary || entry.raw || '';
      if (!key) continue;
      if (seen.has(key)) {
        duplicates += 1;
      } else {
        seen.set(key, 1);
      }
    }
    if (duplicates > 0) {
      findings.push({
        type: 'redundant_session_logs',
        count: duplicates,
        detail: `Detected ${duplicates} overlapping/duplicate session log signature(s).`
      });
    }

    // Flag oversized telemetry feed (LTRIM keeps 10k, but warn above 8k).
    const feedLen = await redis.llen('kudbee:telemetry_feed');
    if (feedLen > 8000) {
      findings.push({
        type: 'oversized_telemetry_feed',
        count: feedLen,
        detail: `Telemetry feed length ${feedLen} approaching cap — consider archival.`
      });
    }
  } catch (err) {
    log.error('memory layer audit failed:', err.message);
  }
  return findings;
}

/**
 * Scan the proposed-action queue for unoptimized prompt/logic pairs that are
 * strong candidates to be tagged and promoted into the "Proven" index so the
 * Governance router can serve them via Fast-Brain matching.
 */
async function auditUnoptimizedLogic() {
  const findings = [];
  try {
    const proposed = await listProposed();
    for (const entry of proposed) {
      const prompt = entry.prompt || '';
      const match = await matchLogic(prompt);
      // A proposed action whose prompt already has a near-match, or that is
      // well-formed and self-contained, is a good candidate for the Proven index.
      if (match.matched || (prompt.length > 24 && entry.action)) {
        findings.push({
          type: 'promotable_logic_pair',
          id: entry.id,
          tags: entry.tags,
          detail: `Prompt/logic pair "${prompt.slice(0, 60)}…" is a candidate for the Proven index.`
        });
      }
    }
  } catch (err) {
    log.error('logic audit failed:', err.message);
  }
  return findings;
}

/**
 * Performs a single full audit pass. Surfaces findings as `AUDIT` log lines
 * and persists promotable logic pairs as new "Proposed" governance actions so
 * a human can approve them into the Proven index via the dashboard.
 */
export async function runAudit() {
  const redis = getRedisClient({ label: 'hermes' });
  log.audit('audit pass started');

  const memoryFindings = await auditMemoryLayer(redis);
  const logicFindings = await auditUnoptimizedLogic();

  for (const f of memoryFindings) {
    log.warn(`memory:${f.type}`, `(${f.count})`, f.detail);
    // Surface memory-inefficiency findings as live operator toasts.
    await publishAuditEvent('hermes_suggestion', {
      id: `mem-${f.type}-${Date.now()}`,
      action: 'OPTIMIZE_MEMORY',
      tags: ['hermes-auditor', 'memory'],
      prompt: f.detail,
      detail: f.detail
    });
  }

  let promoted = 0;
  for (const f of logicFindings) {
    if (f.type === 'promotable_logic_pair') {
      log.audit('promotable', `id=${f.id}`, `tags=${JSON.stringify(f.tags)}`, f.detail);
      try {
        const proposed = await proposeAction({
          action: `PROMOTE_LOGIC:${f.id}`,
          tags: Array.isArray(f.tags) ? f.tags.concat('hermes-audited') : ['hermes-audited'],
          prompt: `Audit promotion candidate ${f.id}`,
          id: `hermes-${f.id}`
        });
        promoted += 1;
        // Live suggestion toast to promote the pair into the PROVEN index.
        await publishAuditEvent('hermes_suggestion', {
          id: proposed.id,
          action: proposed.action,
          tags: proposed.tags,
          prompt: proposed.prompt,
          detail: f.detail
        });
      } catch (err) {
        log.error('failed to propose promotion:', err.message);
      }
    }
  }

  log.audit(
    `audit pass complete — memory_findings=${memoryFindings.length}, ` +
      `logic_findings=${logicFindings.length}, promoted=${promoted}`
  );

  return { memoryFindings, logicFindings, promoted };
}

// Publish an audit finding to the real-time event bus (best-effort).
async function publishAuditEvent(type, data) {
  try {
    const redis = getRedisClient({ label: 'hermes' });
    await redis.publish('kudbee:events', JSON.stringify({ type, data, ts: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}

export const hermes = {
  agentId: AGENT_ID,
  prefix: PREFIX,
  log,
  runAudit,
  publishHeartbeat,
  reportOffline
};

export default hermes;
