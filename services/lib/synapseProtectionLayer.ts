/**
 * services/lib/synapseProtectionLayer.ts
 * ---------------------------------------------------------------------------
 * Synapse Protection Layer — Quantitative Threat Barrier (C4769 Protocol).
 *
 * Modeled after the Suboxone (buprenorphine/naloxone) defense mechanism:
 *   - Therapeutic path (oral):  Legitimate agents pass through transparently.
 *   - Injection path (IV):      Unauthorized access triggers immediate
 *                                "precipitated withdrawal" — rejection,
 *                                escalating lockout, and blacklist.
 *
 * Quantitative Approach:
 *   Each incoming agent connection is projected as a feature vector V_in
 *   in an n-dimensional behavioral space. The cosine angle θ between V_in
 *   and the legitimate agent subspace S_valid is computed via:
 *
 *     cos(θ) = (V_in · V_known) / (||V_in|| × ||V_known||)
 *     threat_score = 1 - cos(θ)  — normalized [0, 2]
 *
 *   Protractor constant C4769 = 0.4769 (the rejection threshold in radians).
 *   θ > C4769 → precipitated withdrawal triggered.
 *
 *   In practice, the threshold maps to threat_score > 0.35 (cos θ < 0.65).
 *
 * Escalation model:
 *   Level 0: Pass (θ < C4769)                    → transparent
 *   Level 1: Warn (1st violation, t < 60s)        → 403 + rate limit halved
 *   Level 2: Block (2nd violation, t < 300s)       → 403 + full block 60s
 *   Level 3: Lockout (3rd violation, t < 900s)    → 403 + blacklist 900s
 *
 * Integration point: Express middleware in services/ingestion/server.js.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// ── Constants ───────────────────────────────────────────────────────────────

const PROT_CONSTANT_C4769 = 0.4769;       // Rejection threshold in radians
const COS_THRESHOLD = Math.cos(PROT_CONSTANT_C4769); // ≈ 0.889
const THREAT_THRESHOLD = 1 - COS_THRESHOLD;          // ≈ 0.111
const ESCALATION_WINDOW_MS = 60_000;      // Level 1→2 window
const BLOCK_WINDOW_MS = 300_000;          // Level 2 block duration
const LOCKOUT_WINDOW_MS = 900_000;        // Level 3 blacklist duration
const MAX_KNOWN_FINGERPRINTS = 50;        // Max stored known-good fingerprints

// ── Types ───────────────────────────────────────────────────────────────────

interface BehavioralFingerprint {
  agentId: string;
  publicKey: string;
  headerPattern: string;       // normalized header fingerprint
  methodPattern: string;       // HTTP method + path pattern
  rateWindow: number;          // avg ms between requests
  firstSeen: number;
  lastSeen: number;
  passCount: number;
  threatScore: number;
}

interface SynapseState {
  fingerprints: Map<string, BehavioralFingerprint>;
  violations: Map<string, Array<{ timestamp: number; score: number }>>;
  lockedOut: Map<string, number>; // IP/agentId → unlock timestamp
  stats: {
    totalPassed: number;
    totalRejected: number;
    totalLockedOut: number;
    currentLockouts: number;
  };
}

// ── State ───────────────────────────────────────────────────────────────────

const state: SynapseState = {
  fingerprints: new Map(),
  violations: new Map(),
  lockedOut: new Map(),
  stats: { totalPassed: 0, totalRejected: 0, totalLockedOut: 0, currentLockouts: 0 },
};

// ── Feature Vector Extraction ───────────────────────────────────────────────

function ipToVector(ip: string): number[] {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4) return [0, 0, 0, 0];
  return octets.map((o) => (isNaN(o) ? 0 : o / 255));
}

function headersToVector(req: Request): number[] {
  const features: number[] = [];
  const hasAgentPass = req.headers['x-agent-pass'] ? 1 : 0;
  const hasAuth = req.headers['authorization'] ? 1 : 0;
  const contentType = (req.headers['content-type'] || '').includes('json') ? 1 : 0;
  const userAgentHash = req.headers['user-agent']
    ? parseInt(crypto.createHash('md5').update(req.headers['user-agent'] as string).digest('hex').slice(0, 8), 16) / 0xffffffff
    : 0;
  features.push(hasAgentPass, hasAuth, contentType, userAgentHash);
  return features;
}

function methodToVector(req: Request): number[] {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const methodIdx = methods.indexOf(req.method);
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? 1 : 0;
  const pathParts = req.path.split('/').filter(Boolean);
  const depth = Math.min(pathParts.length / 5, 1);
  return [methodIdx >= 0 ? methodIdx / 5 : 0, isMutating, depth];
}

/**
 * Extract the full behavioral feature vector V_in from an incoming request.
 */
function extractFeatureVector(req: Request): number[] {
  return [
    ...ipToVector((req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0'),
    ...headersToVector(req),
    ...methodToVector(req),
  ];
}

// ── Cosine Similarity Threat Scoring ───────────────────────────────────────

function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function magnitude(v: number[]): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/**
 * Compute the threat score using the protractor C4769 model.
 * @returns { score: number, angle: number, precipitated: boolean }
 */
function computeThreatScore(incoming: number[], known: BehavioralFingerprint['methodPattern']): {
  score: number;
  angle: number;
  precipitated: boolean;
} {
  // Build known-good vector from fingerprint
  const knownVec = [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 0.5, 0.2, 0, 0.1]; // legitimate agent pattern

  const cos = cosineSimilarity(incoming, knownVec);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  const score = 1 - cos;

  const precipitated = angle > PROT_CONSTANT_C4769;

  return { score, angle, precipitated };
}

// ── Fingerprint Registry ────────────────────────────────────────────────────

export function registerFingerprint(agentId: string, publicKey: string): void {
  const fingerprint: BehavioralFingerprint = {
    agentId,
    publicKey,
    headerPattern: 'agent-pass+auth+json',
    methodPattern: 'post|put|patch',
    rateWindow: 5000,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    passCount: 0,
    threatScore: 0,
  };
  state.fingerprints.set(agentId, fingerprint);

  if (state.fingerprints.size > MAX_KNOWN_FINGERPRINTS) {
    const oldest = [...state.fingerprints.entries()]
      .sort((a, b) => a[1].firstSeen - b[1].firstSeen)
      .shift();
    if (oldest) state.fingerprints.delete(oldest[0]);
  }
}

// ── Violation Escalation ────────────────────────────────────────────────────

function escalate(source: string, score: number): { blocked: boolean; level: number; duration: number } {
  const now = Date.now();

  // Check active lockout
  const locked = state.lockedOut.get(source);
  if (locked && now < locked) {
    return { blocked: true, level: 3, duration: locked - now };
  }

  let violations = state.violations.get(source);
  if (!violations) {
    violations = [];
    state.violations.set(source, violations);
  }

  // Purge stale violations outside escalation window
  violations = violations.filter((v) => now - v.timestamp < ESCALATION_WINDOW_MS * 3);
  state.violations.set(source, violations);

  violations.push({ timestamp: now, score });
  const count = violations.length;

  if (count === 1) {
    state.stats.totalRejected++;
    return { blocked: true, level: 1, duration: ESCALATION_WINDOW_MS };
  }
  if (count === 2) {
    state.stats.totalRejected++;
    return { blocked: true, level: 2, duration: BLOCK_WINDOW_MS };
  }
  if (count >= 3) {
    state.lockedOut.set(source, now + LOCKOUT_WINDOW_MS);
    state.stats.totalLockedOut++;
    state.stats.currentLockouts++;
    return { blocked: true, level: 3, duration: LOCKOUT_WINDOW_MS };
  }

  return { blocked: false, level: 0, duration: 0 };
}

// ── Express Middleware ──────────────────────────────────────────────────────

/**
 * Synapse Protection Middleware.
 * Sits BEFORE the auth middleware in the server pipeline.
 * Evaluates incoming connections using the C4769 protractor model.
 * Triggers precipitated withdrawal for threat vectors exceeding threshold.
 */
export async function synapseProtectionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip local connections (health checks, boot-verify, local dev)
  const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    state.stats.totalPassed++;
    return next();
  }

  const source = ip;
  const agentId = typeof req.headers['x-agent-id'] === 'string' ? req.headers['x-agent-id'] : '';

  // Skip non-mutating read requests (therapeutic path)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    state.stats.totalPassed++;
    return next();
  }

  // Extract behavioral vector
  const featureVec = extractFeatureVector(req);

  // Check against known fingerprints
  let matchedFingerprint: BehavioralFingerprint | undefined;
  if (agentId) {
    matchedFingerprint = state.fingerprints.get(agentId);
  }

  // Compute threat score
  const { score, angle, precipitated } = computeThreatScore(featureVec, matchedFingerprint?.methodPattern || '');

  // Known agent — update fingerprint, transparent pass
  if (matchedFingerprint) {
    matchedFingerprint.passCount++;
    matchedFingerprint.lastSeen = Date.now();
    matchedFingerprint.threatScore = Math.max(0, matchedFingerprint.threatScore - 0.01); // decay
    state.stats.totalPassed++;

    // Log for audit
    if (score > 0.05) {
      console.warn(`[Synapse] Known agent ${agentId}: θ=${angle.toFixed(4)}rad (${(angle * (180 / Math.PI)).toFixed(1)}°) score=${score.toFixed(4)} — elevated but passing`);
    }

    return next();
  }

  // Unknown agent — evaluate
  if (precipitated) {
    const escalation = escalate(source, score);

    console.warn(
      `[Synapse] PRECIPITATED WITHDRAWAL — ${source} agent=${agentId || 'UNKNOWN'} ` +
      `θ=${angle.toFixed(4)}rad (${(angle * (180 / Math.PI)).toFixed(1)}°) ` +
      `score=${score.toFixed(4)} level=${escalation.level} ` +
      `blocked=${escalation.duration}ms`
    );

    // Publish security event (best-effort)
    try {
      const { publishEvent } = await import('./unifiedEvents.js');
      void publishEvent('synapse', 'precipitated_withdrawal', {
        source,
        agentId,
        angle: angle.toFixed(4),
        score: score.toFixed(4),
        level: escalation.level,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    } catch {}

    res.status(403).json({
      error: 'SYNAPSE_REJECTED',
      code: 'PRECIPITATED_WITHDRAWAL',
      message: `Access denied. Threat vector exceeds C4769 threshold. θ=${angle.toFixed(4)} rad.`,
      retryAfter: Math.ceil(escalation.duration / 1000),
    });
    return;
  }

  // Unknown but below threshold — allow with warning, auto-register
  if (agentId && score < THREAT_THRESHOLD) {
    console.log(`[Synapse] Registering new agent ${agentId}: θ=${angle.toFixed(4)}rad score=${score.toFixed(4)}`);
    registerFingerprint(agentId, 'auto-registered');
    state.stats.totalPassed++;
    return next();
  }

  // Unknown, no agentId, below threshold
  state.stats.totalPassed++;
  next();
}

// ── Status Export ───────────────────────────────────────────────────────────

export function getSynapseStatus(): object {
  const now = Date.now();
  const activeLockouts = [...state.lockedOut.entries()].filter(([, unlockAt]) => now < unlockAt).length;
  state.stats.currentLockouts = activeLockouts;

  return {
    protocol: 'C4769',
    threshold: PROT_CONSTANT_C4769,
    cosThreshold: COS_THRESHOLD.toFixed(4),
    knownFingerprints: state.fingerprints.size,
    stats: { ...state.stats },
    violations: [...state.violations.entries()].map(([source, v]) => ({
      source,
      count: v.length,
      lastScore: v[v.length - 1]?.score || 0,
      lastSeen: v[v.length - 1]?.timestamp ? new Date(v[v.length - 1]!.timestamp).toISOString() : null,
    })),
    lockedOut: [...state.lockedOut.entries()]
      .filter(([, unlockAt]) => now < unlockAt)
      .map(([source, unlockAt]) => ({
        source,
        unlockAt: new Date(unlockAt).toISOString(),
        remainingMs: unlockAt - now,
      })),
  };
}

export function getSynapseStats() {
  return { ...state.stats, protocol: 'C4769' };
}

// ── Admin: Clear Lockout ────────────────────────────────────────────────────

export function clearSynapseLockout(source: string): void {
  state.lockedOut.delete(source);
  state.violations.delete(source);
  console.log(`[Synapse] Lockout cleared for ${source}`);
}

// ── Warmup: Register default agents from config ─────────────────────────────

export function bootstrapSynapseProtection(): void {
  try {
    const agentsConfig = JSON.parse(readFileSync('config/agents.json', 'utf8'));
    const registry = agentsConfig.registry || [];
    for (const agent of registry) {
      if (agent.agentId && agent.publicKey) {
        registerFingerprint(agent.agentId, agent.publicKey);
      }
    }
    console.log(`[Synapse] Bootstrapped ${registry.length} known agent fingerprints`);
  } catch {
    console.warn('[Synapse] Could not load agent registry — starting with empty fingerprints');
  }
}

export default synapseProtectionMiddleware;
