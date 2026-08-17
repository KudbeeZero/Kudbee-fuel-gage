/**
 * services/lib/temporalTechnician.ts
 * -----------------------------------------------------------------------
 * KUDBEE Temporal Technician — Phase I: Read-Only Forensic Engine
 *
 * Reconstructs what happened to KUDBEE over time by correlating events
 * across application logs, AWS/EC2 metadata, Synapse security records,
 * deployment history, and process lifecycle data.
 *
 * MUTATION POLICY: Phase I is READ-ONLY. No production mutations.
 * No autonomous actions. No deployment triggers. No security changes.
 * C4769 is preserved. Production is frozen.
 *
 * Operations:
 *   search()    — chronological event query
 *   snapshot()  — system state at a point in time
 *   diff()      — delta between two snapshots
 *   trace()     — causal event chain from root event
 *   whatChanged() — concise human summary of delta
 * -----------------------------------------------------------------------
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type EventType =
  | 'DEPLOY' | 'SCALE' | 'CONFIG_CHANGE' | 'PROCESS_START' | 'PROCESS_STOP'
  | 'PROCESS_CRASH' | 'HEALTH_CHECK' | 'DATABASE_EVENT' | 'REDIS_EVENT'
  | 'SECURITY_REJECTION' | 'AUTHENTICATION_EVENT' | 'SSE_EVENT'
  | 'CI_EVENT' | 'STAGING_EVENT' | 'PROMOTION_EVENT'
  | 'USER_ACTION' | 'PLATFORM_EVENT' | 'SYSTEM_BOOT' | 'OBSERVATION';

export type EventClassification =
  | 'EXPECTED' | 'USER_INITIATED' | 'DEPLOY_RESTART' | 'SCALE_RESTART'
  | 'CONFIG_RESTART' | 'CRASH_RESTART' | 'PLATFORM_RESTART'
  | 'MANUAL_RESTART' | 'SECURITY_REJECTION' | 'APPLICATION_FAILURE'
  | 'INFRASTRUCTURE_FAILURE' | 'CI_BLOCKED' | 'UNKNOWN';

export interface TemporalEvent {
  event_id: string;
  timestamp: string;
  event_type: EventType;
  source: string;
  target?: string;
  environment: 'production' | 'staging' | 'local' | 'ci';
  release_sha?: string;
  dyno?: string;
  process?: string;
  request_id?: string;
  correlation_id?: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  classification: EventClassification;
  confidence: number; // 0.0 to 1.0
  observed: string;    // WHAT WAS OBSERVED — raw evidence
  inferred: string;    // WHAT WAS INFERRED — classification reasoning
  evidence: string[];  // list of supporting evidence points
  metadata: Record<string, string>;
  reclassified_from?: string;
  reclassified_reason?: string;
}

export interface TemporalSnapshot {
  snapshot_id: string;
  timestamp: string;
  release_sha?: string;
  environment: string;
  application_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  postgres_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  redis_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  security_state: 'ACTIVE' | 'HOLDING' | 'INCIDENT';
  staging_state: 'GREEN' | 'YELLOW' | 'RED';
  ci_state: 'AVAILABLE' | 'BLOCKED' | 'FAILED';
  promotion_state: 'AUTHORIZED' | 'FROZEN';
  dyno_count: number;
  active_incidents: number;
  notes: string;
}

export interface TemporalDiff {
  before: string;
  after: string;
  changes: string[];
  unchanged: string[];
  events: TemporalEvent[];
  classification: EventClassification | null;
  impact: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LEDGER (persistent, append-only)
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory');
const LEDGER_PATH = join(MEMORY_DIR, 'temporal-ledger.json');
const SNAPSHOT_PATH = join(MEMORY_DIR, 'temporal-snapshots.json');

function ensureStore() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

let _ledger: TemporalEvent[] = [];
let _snapshots: TemporalSnapshot[] = [];

// Load existing ledger
try {
  if (existsSync(LEDGER_PATH)) {
    _ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  }
} catch { _ledger = []; }

// Load existing snapshots
try {
  if (existsSync(SNAPSHOT_PATH)) {
    _snapshots = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  }
} catch { _snapshots = []; }

function persistLedger() {
  ensureStore();
  writeFileSync(LEDGER_PATH, JSON.stringify(_ledger, null, 2));
}

function persistSnapshots() {
  ensureStore();
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(_snapshots, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a new event to the temporal ledger.
 * Events are immutable — reclassifications append a NEW entry.
 */
export function recordEvent(
  params: Omit<TemporalEvent, 'event_id'>
): TemporalEvent {
  const event: TemporalEvent = {
    ...params,
    event_id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
  _ledger.push(event);
  persistLedger();
  return event;
}

/**
 * Reclassify an existing event by appending a new correlated entry.
 * The original event is preserved.
 */
export function reclassifyEvent(
  event_id: string,
  newClassification: EventClassification,
  reason: string,
  newConfidence: number
): TemporalEvent | null {
  const original = _ledger.find(e => e.event_id === event_id);
  if (!original) return null;
  const reclassified: TemporalEvent = {
    ...original,
    event_id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    classification: newClassification,
    confidence: newConfidence,
    inferred: `Reclassified from ${original.classification}: ${reason}`,
    reclassified_from: original.classification,
    reclassified_reason: reason,
    evidence: [...original.evidence, `Reclassified: ${reason}`],
  };
  _ledger.push(reclassified);
  persistLedger();
  return reclassified;
}

/**
 * Search the temporal ledger with optional filters.
 * Returns events in chronological order.
 */
export function search(params: {
  from?: string;
  to?: string;
  event_type?: EventType;
  classification?: EventClassification;
  source?: string;
  severity?: string;
  environment?: string;
  limit?: number;
}): TemporalEvent[] {
  let results = [..._ledger];

  if (params.from) results = results.filter(e => e.timestamp >= params.from!);
  if (params.to) results = results.filter(e => e.timestamp <= params.to!);
  if (params.event_type) results = results.filter(e => e.event_type === params.event_type);
  if (params.classification) results = results.filter(e => e.classification === params.classification);
  if (params.source) results = results.filter(e => e.source.includes(params.source!));
  if (params.severity) results = results.filter(e => e.severity === params.severity);
  if (params.environment) results = results.filter(e => e.environment === params.environment);

  results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (params.limit) results = results.slice(0, params.limit);
  return results;
}

/**
 * Create a system snapshot at the current point in time.
 */
export function snapshot(params: {
  release_sha?: string;
  environment: string;
  application_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  postgres_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  redis_health: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  security_state: 'ACTIVE' | 'HOLDING' | 'INCIDENT';
  staging_state: 'GREEN' | 'YELLOW' | 'RED';
  ci_state: 'AVAILABLE' | 'BLOCKED' | 'FAILED';
  promotion_state: 'AUTHORIZED' | 'FROZEN';
  dyno_count: number;
  active_incidents?: number;
  notes?: string;
}): TemporalSnapshot {
  const snap: TemporalSnapshot = {
    snapshot_id: `snap-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    ...params,
    active_incidents: params.active_incidents || 0,
    notes: params.notes || '',
  };
  _snapshots.push(snap);
  persistSnapshots();
  return snap;
}

/**
 * Get a snapshot by ID or by timestamp proximity.
 */
export function getSnapshot(idOrTimestamp: string): TemporalSnapshot | null {
  const byId = _snapshots.find(s => s.snapshot_id === idOrTimestamp);
  if (byId) return byId;
  // Find closest snapshot to the given timestamp
  let closest: TemporalSnapshot | null = null;
  let minDiff = Infinity;
  for (const s of _snapshots) {
    const diff = Math.abs(new Date(s.timestamp).getTime() - new Date(idOrTimestamp).getTime());
    if (diff < minDiff) { minDiff = diff; closest = s; }
  }
  return closest;
}

/**
 * Compute the diff between two snapshots.
 */
export function diff(
  beforeId: string,
  afterId: string
): TemporalDiff | null {
  const before = getSnapshot(beforeId);
  const after = getSnapshot(afterId);
  if (!before || !after) return null;

  const changes: string[] = [];
  const unchanged: string[] = [];

  const fields: Array<{ key: keyof TemporalSnapshot; label: string }> = [
    { key: 'release_sha', label: 'Release SHA' },
    { key: 'application_health', label: 'Application health' },
    { key: 'postgres_health', label: 'PostgreSQL health' },
    { key: 'redis_health', label: 'Redis health' },
    { key: 'security_state', label: 'Security state' },
    { key: 'staging_state', label: 'Staging state' },
    { key: 'ci_state', label: 'CI state' },
    { key: 'promotion_state', label: 'Promotion state' },
    { key: 'dyno_count', label: 'Dyno count' },
  ];

  for (const { key, label } of fields) {
    if (before[key] !== after[key]) {
      changes.push(`${label}: ${before[key]} → ${after[key]}`);
    } else {
      unchanged.push(`${label}: ${before[key]} (unchanged)`);
    }
  }

  const events = search({ from: before.timestamp, to: after.timestamp });

  let classification: EventClassification | null = null;
  if (changes.some(c => c.includes('Dyno count'))) classification = 'SCALE_RESTART';
  else if (changes.some(c => c.includes('Release SHA'))) classification = 'DEPLOY_RESTART';
  else if (changes.length === 0) classification = 'EXPECTED';

  return {
    before: before.snapshot_id,
    after: after.snapshot_id,
    changes,
    unchanged,
    events,
    classification,
    impact: changes.length === 0 ? 'NONE DETECTED' : `${changes.length} subsystems changed`,
  };
}

/**
 * Trace a causal event chain from a root event.
 */
export function trace(
  eventId: string,
  windowMs: number = 300_000
): TemporalEvent[] {
  const root = _ledger.find(e => e.event_id === eventId);
  if (!root) return [];

  const rootTime = new Date(root.timestamp).getTime();
  return _ledger
    .filter(e => {
      const eTime = new Date(e.timestamp).getTime();
      const within = Math.abs(eTime - rootTime) <= windowMs;
      const sameEnv = e.environment === root.environment;
      const sameDyno = root.dyno ? e.dyno === root.dyno : true;
      return within && sameEnv && sameDyno;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Produce a concise human-readable summary of what changed between two snapshots.
 */
export function whatChanged(
  beforeId: string,
  afterId: string
): string {
  const d = diff(beforeId, afterId);
  if (!d) return `No snapshots found for ${beforeId} → ${afterId}.`;

  const lines: string[] = [
    'TEMPORAL DELTA',
    '────────────────────────',
  ];

  for (const u of d.unchanged.slice(0, 8)) lines.push(u);
  if (d.changes.length > 0) {
    lines.push('');
    for (const c of d.changes) lines.push(c);
  }
  lines.push('');
  if (d.events.length > 0) {
    lines.push(`Root event: ${d.events[0]!.event_type}`);
    lines.push(`Result: ${d.classification || 'UNKNOWN'}`);
  }
  lines.push(`Production impact: ${d.impact}`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA — Known forensic history from session 2026-07-29
// ─────────────────────────────────────────────────────────────────────────────

export function seedForensicHistory(): void {
  if (_ledger.length > 0) return; // Already seeded

  recordEvent({
    timestamp: '2026-07-29T21:17:04Z',
    event_type: 'DEPLOY',
    source: 'KILO',
    target: 'production',
    environment: 'production',
    release_sha: 'f423c14',
    severity: 'P3',
    classification: 'DEPLOY_RESTART',
    confidence: 0.99,
    observed: 'git push ec2 HEAD:main deployed release f423c14. All 4 workers received SIGTERM and restarted on v342. Health restored within 15 seconds.',
    inferred: 'DEPLOY_RESTART: Normal deployment lifecycle. Expected SIGTERM during rollout. No crash. Health check passed after restart.',
    evidence: [
      'EC2 release v342 created',
      'All dynos transitioned to starting → up',
      '/health returned 200 after restart',
      'PostgreSQL: healthy',
      'Redis: healthy',
    ],
    metadata: { user: 'KILO', deploy_method: 'git push' },
  });

  recordEvent({
    timestamp: '2026-07-29T21:53:49Z',
    event_type: 'SCALE',
    source: 'dominick.ziola@gmail.com',
    target: 'production',
    environment: 'production',
    release_sha: 'f423c14',
    severity: 'P3',
    classification: 'SCALE_RESTART',
    confidence: 0.98,
    observed: 'EC2 worker scaling operation by dominick.ziola@gmail.com. Workers received SIGTERM and restarted. Health restored.',
    inferred: 'SCALE_RESTART: User-initiated scaling/reconfiguration. Not a crash. Expected lifecycle interruption.',
    evidence: [
      'EC2 log: "Scaled to hermes-worker@1 ... by user dominick.ziola@gmail.com"',
      'SIGTERM received by all dynos',
      'Processes exited gracefully',
      'Processes restarted and returned UP',
      'Health check passing after restart',
    ],
    metadata: { user: 'dominick', action: 'scale' },
  });

  recordEvent({
    timestamp: '2026-07-29T21:17:10Z',
    event_type: 'SECURITY_REJECTION',
    source: '44.193.9.210',
    target: 'POST /api/telemetry/ingest',
    environment: 'production',
    release_sha: 'f423c14',
    severity: 'P3',
    classification: 'SECURITY_REJECTION',
    confidence: 0.95,
    observed: 'AWS EC2 IP 44.193.9.210 sent POST /api/telemetry/ingest without agent authentication headers. Synapse C4769 rejected with escalating blocks: level 1 (60s) → level 2 (300s) → level 3 (900s).',
    inferred: 'LEGITIMATE SECURITY REJECTION: IP not whitelisted, no agent-pass header present. C4769 behaving correctly. Likely Sentinel egress probe misconfigured to hit telemetry endpoint without auth.',
    evidence: [
      'Synapse violation record: IP=44.193.9.210, agent=UNKNOWN, score=0.4752',
      'Escalation: level 1 → level 2 → level 3 confirmed',
      'C4769 threshold maintained at 0.4769 rad',
      'No other security anomalies detected',
    ],
    metadata: { ip: '44.193.9.210', provider: 'AWS/EC2', region: 'us-east-1' },
  });

  recordEvent({
    timestamp: '2026-07-29T21:17:15Z',
    event_type: 'SSE_EVENT',
    source: 'logplex',
    target: 'production',
    environment: 'production',
    release_sha: 'f423c14',
    severity: 'P3',
    classification: 'EXPECTED',
    confidence: 0.90,
    observed: 'L10 output buffer overflow — 1 message dropped during startup. Likely caused by SSE reconnection burst after deployment restart.',
    inferred: 'LOW PRIORITY: One-time startup burst. Not recurring. Monitor for recurrence.',
    evidence: [
      'EC2 log: "Error L10 (output buffer overflow): 1 messages dropped"',
      'Single occurrence observed',
      'No recurrence in subsequent observation windows',
      'SSE connections stabilized after initial burst',
    ],
    metadata: { type: 'L10_overflow', count: '1' },
  });

  // Baseline snapshot
  snapshot({
    release_sha: 'f423c14',
    environment: 'production',
    application_health: 'HEALTHY',
    postgres_health: 'HEALTHY',
    redis_health: 'HEALTHY',
    security_state: 'HOLDING',
    staging_state: 'GREEN',
    ci_state: 'BLOCKED',
    promotion_state: 'FROZEN',
    dyno_count: 4,
    notes: 'BASELINE from 2026-07-29T22:10Z. Application stable. No new events. Production frozen.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export function getLedger() { return _ledger; }
export function getSnapshots() { return _snapshots; }

export default {
  recordEvent,
  reclassifyEvent,
  search,
  snapshot,
  getSnapshot,
  diff,
  trace,
  whatChanged,
  seedForensicHistory,
  getLedger: () => _ledger,
  getSnapshots: () => _snapshots,
};
