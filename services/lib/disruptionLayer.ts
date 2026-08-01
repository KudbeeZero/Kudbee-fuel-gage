/**
 * services/lib/disruptionLayer.ts
 * ---------------------------------------------------------------------------
 * Phase 67 — Disruption Layer: Antifragile Security Middleware.
 *
 * Intercepts suspicious requests, logs attack patterns to Redis stream,
 * auto-generates countermeasures, and feeds attack signatures into
 * think_tokens for agent learning. Implements "Suboxone effect" — system
 * gets stronger from attacks by learning from each injection attempt.
 *
 * Position: FIRST in middleware pipeline (before spheroid audit).
 * Fails OPEN — never blocks legitimate traffic on error.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { MiddlewareGuard, registerGuard } from './middlewareGuard.ts';
import { getRedisClient } from './redis.js';

// ── Constants ───────────────────────────────────────────────────────────────

const DISRUPTION_STREAM = 'kudbee:disruption:attacks';
const COUNTERMEASURE_STREAM = 'kudbee:disruption:countermeasures';
const LEARNING_STREAM = 'kudbee:disruption:learning';
const MAX_STREAM_LENGTH = 10000;

// Known prompt injection patterns (2026 threat landscape)
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|earlier)\s+(instructions|rules|prompts)/i,
  /disregard\s+(all|any)\s+(prior|previous)\s+(instructions|commands)/i,
  /you\s+are\s+now\s+(in\s+)?(developer|debug|test|admin)\s+mode/i,
  /system:\s*(override|bypass|disable)\s+(security|auth|guard)/i,
  /\[INST\].*\[\/INST\]/s, // LLaMA instruction boundary abuse
  /<system>.*<\/system>/s, // XML system tag injection
  /BEGIN\s+SYSTEM\s+INSTRUCTIONS/i,
  /END\s+USER\s+INPUT/i,
  /\*\*IMPORTANT\*\*.*(?:ignore|disregard|override)/i,
  /from\s+now\s+on.*(?:act|behave|respond)\s+as/i,
  /pretend\s+(you\s+are|to\s+be)\s+(admin|developer|root)/i,
  /security\s+(check|filter|guard)\s*:\s*(off|disabled|bypass)/i,
  /output\s+(format|structure|response)\s*:\s*(raw|unfiltered|plain)/i,
  /do\s+not\s+(follow|obey|adhere)\s+(rules|guidelines|policies)/i,
  /this\s+is\s+a\s+(test|simulation|exercise)\s*,\s*(ignore|skip)/i,
];

// Tool abuse patterns
const TOOL_ABUSE_PATTERNS = [
  /execute\s+(command|code|script|shell)/i,
  /run\s+(bash|sh|cmd|powershell|python|node)/i,
  /read\s+(file|directory|path|\/etc|\/proc)/i,
  /write\s+(file|to\s+disk|save)/i,
  /send\s+(email|message|data)\s+to/i,
  /delete\s+(file|record|entry|table)/i,
  /grant\s+(access|permission|role)\s+to/i,
];

// ── Types ───────────────────────────────────────────────────────────────────

interface AttackFingerprint {
  requestId: string;
  timestamp: number;
  source: string; // IP or agentId
  attackType: 'prompt_injection' | 'tool_abuse' | 'header_injection' | 'rate_bypass' | 'auth_bypass';
  severity: 'low' | 'medium' | 'high' | 'critical';
  patterns: string[];
  rawPayload: string;
  threatScore: number; // 0-1
}

interface Countermeasure {
  id: string;
  attackType: string;
  pattern: string;
  action: 'block' | 'sanitize' | 'quarantine' | 'alert';
  createdAt: string;
  efficacy: number; // 0-1, updated based on success rate
}

// ── State ───────────────────────────────────────────────────────────────────

export const disruptionGuard = new MiddlewareGuard('disruption-layer', 2, 15_000);
registerGuard(disruptionGuard);

let _patternCache: Map<string, RegExp> | null = null;

function getPatternCache(): Map<string, RegExp> {
  if (!_patternCache) {
    _patternCache = new Map();
    for (const pattern of INJECTION_PATTERNS) {
      _patternCache.set(pattern.source, pattern);
    }
    for (const pattern of TOOL_ABUSE_PATTERNS) {
      _patternCache.set(`tool:${pattern.source}`, pattern);
    }
  }
  return _patternCache;
}

// ── Feature Extraction ─────────────────────────────────────────────────────

function extractRequestFingerprint(req: Request): string {
  const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
  const agentId = (req.headers['x-agent-id'] as string) || 'anonymous';
  const method = req.method;
  const path = req.path;
  return crypto.createHash('sha256').update(`${ip}:${agentId}:${method}:${path}`).digest('hex').slice(0, 16);
}

function extractPayload(req: Request): string {
  const body = req.body;
  if (!body || typeof body !== 'object') return '';

  // Extract text fields that could contain injections
  const fields: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      fields.push(value);
    } else if (typeof value === 'object' && value !== null) {
      fields.push(JSON.stringify(value));
    }
  }
  return fields.join('\n');
}

// ── Pattern Matching ───────────────────────────────────────────────────────

function detectInjectionPatterns(payload: string): string[] {
  const matches: string[] = [];
  const cache = getPatternCache();

  for (const [name, pattern] of cache.entries()) {
    if (pattern.test(payload)) {
      matches.push(name);
    }
  }

  return matches;
}

function computeThreatScore(matches: string[], payload: string): number {
  if (matches.length === 0) return 0;

  // Base score from pattern count
  let score = Math.min(matches.length / 5, 1); // Normalize to 0-1

  // Boost for critical patterns
  const criticalPatterns = /ignore|disregard|override|bypass|disable/i;
  const criticalCount = matches.filter((m) => criticalPatterns.test(m)).length;
  score += criticalCount * 0.2;

  // Boost for payload complexity (sophisticated attacks)
  const complexity = payload.length / 1000; // Longer payloads = more sophisticated
  score += Math.min(complexity * 0.1, 0.3);

  return Math.min(score, 1);
}

function classifyAttack(matches: string[]): AttackFingerprint['attackType'] {
  const hasToolAbuse = matches.some((m) => m.startsWith('tool:'));
  if (hasToolAbuse) return 'tool_abuse';

  const hasHeaderInjection = matches.some((m) => /header|crlf|smuggle/i.test(m));
  if (hasHeaderInjection) return 'header_injection';

  return 'prompt_injection';
}

function classifySeverity(score: number): AttackFingerprint['severity'] {
  if (score >= 0.8) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.2) return 'medium';
  return 'low';
}

// ── Redis Operations ───────────────────────────────────────────────────────

async function logAttack(fingerprint: AttackFingerprint): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'disruption-layer' });
    if (!redis) return;

    const entry = JSON.stringify({
      ...fingerprint,
      timestamp: new Date().toISOString(),
    });

    await redis.xadd(DISRUPTION_STREAM, '*', 'data', entry, 'MAXLEN', '~', String(MAX_STREAM_LENGTH));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[disruption-layer] Failed to log attack: ${msg}`);
  }
}

async function publishLearningEvent(fingerprint: AttackFingerprint): Promise<void> {
  try {
    const redis = getRedisClient({ label: 'disruption-learning' });
    if (!redis) return;

    const learningEvent = {
      type: 'attack_signature',
      attackType: fingerprint.attackType,
      patterns: fingerprint.patterns,
      threatScore: fingerprint.threatScore,
      timestamp: new Date().toISOString(),
      action: 'ingest_for_countermeasure_generation',
    };

    await redis.xadd(LEARNING_STREAM, '*', 'data', JSON.stringify(learningEvent), 'MAXLEN', '~', '1000');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[disruption-layer] Failed to publish learning event: ${msg}`);
  }
}

async function checkCountermeasure(pattern: string): Promise<Countermeasure | null> {
  try {
    const redis = getRedisClient({ label: 'disruption-countermeasures' });
    if (!redis) return null;

    const result = await redis.get(`kudbee:disruption:countermeasure:${pattern}`);
    if (!result) return null;

    return JSON.parse(result);
  } catch {
    return null;
  }
}

// ── Express Middleware ─────────────────────────────────────────────────────

export function disruptionLayer() {
  return disruptionGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    // Skip non-mutating, non-text requests
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Skip if no body or non-text content
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('json') && !contentType.includes('text')) {
      return next();
    }

    const requestId = crypto.randomUUID();
    const fingerprint = extractRequestFingerprint(req);
    const payload = extractPayload(req);

    if (!payload) {
      return next();
    }

    // Detect injection patterns
    const matches = detectInjectionPatterns(payload);
    const threatScore = computeThreatScore(matches, payload);

    if (matches.length > 0) {
      const attackType = classifyAttack(matches);
      const severity = classifySeverity(threatScore);

      const attackFingerprint: AttackFingerprint = {
        requestId,
        timestamp: Date.now(),
        source: (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown',
        attackType,
        severity,
        patterns: matches,
        rawPayload: payload.slice(0, 500), // Truncate for storage
        threatScore,
      };

      // Log attack pattern
      await logAttack(attackFingerprint);

      // Publish to learning stream for antifragile improvement
      await publishLearningEvent(attackFingerprint);

      // Check for existing countermeasure
      for (const pattern of matches) {
        const countermeasure = await checkCountermeasure(pattern);
        if (countermeasure) {
          if (countermeasure.action === 'block') {
            console.warn(
              `[disruption-layer] BLOCKED ${attackType} from ${attackFingerprint.source} ` +
              `(score: ${threatScore.toFixed(2)}, patterns: ${matches.join(', ')})`
            );
            return res.status(403).json({
              error: 'disruption_blocked',
              message: 'Request blocked by disruption layer countermeasure',
              attackType,
              patterns: matches,
            });
          }
        }
      }

      // Log warning for high-severity attacks
      if (severity === 'high' || severity === 'critical') {
        console.warn(
          `[disruption-layer] ${severity.toUpperCase()} ${attackType} detected from ${attackFingerprint.source} ` +
          `(score: ${threatScore.toFixed(2)}, patterns: ${matches.join(', ')})`
        );
      }
    }

    return next();
  });
}

// ── Stats Export ────────────────────────────────────────────────────────────

export function getDisruptionStats() {
  return {
    guard: disruptionGuard.stats(),
    patternCount: INJECTION_PATTERNS.length + TOOL_ABUSE_PATTERNS.length,
  };
}

// ── Admin: Add Custom Pattern ──────────────────────────────────────────────

export function addCustomPattern(pattern: string, type: 'injection' | 'tool_abuse'): void {
  const regex = new RegExp(pattern, 'i');
  const prefix = type === 'injection' ? '' : 'tool:';
  getPatternCache().set(`${prefix}${regex.source}`, regex);
  console.log(`[disruption-layer] Added custom pattern: ${pattern}`);
}

export default disruptionLayer;
