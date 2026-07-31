/**
 * services/lib/bearerAuthMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — Centralized bearer token authentication guard.
 *
 * Extracts Authorization: Bearer <token> from incoming requests, validates
 * against AGENT_REGISTRY or HMAC secret, and attaches the authenticated
 * principal to the request. It also accepts the signed session cookie issued
 * by the canonical ingestion server. Supports optional auth (skipped for
 * public routes) and role-based access control.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { deserializePass, verifyAgentPass, verifySignature, AGENT_PASS_MAX_AGE_MS } from '@kudbee/utils';
import { MiddlewareGuard } from './middlewareGuard.ts';

const STREAM_SECRET = process.env.STREAM_SECRET;
const DEVELOPMENT_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

export const SESSION_COOKIE_NAME = 'kudbee_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AgentIdentity {
  agentId: string;
  roles: string[];
}

interface SessionClaims {
  agentId: string;
  roles: string[];
  issuedAt: number;
  expiresAt: number;
}

interface BearerAuthOptions {
  required?: boolean;
  roles?: string[];
}

export const authGuard = new MiddlewareGuard('bearer-auth', 3, 30_000);

function loadAgentRegistry(): Map<string, string> {
  try {
    const registryPath = process.env.AGENT_REGISTRY_PATH || '';
    if (!registryPath) return new Map();
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map<string, string>();
    for (const agent of parsed.registry || []) {
      if (agent.status === 'active') {
        map.set(agent.agentId, agent.publicKey);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

let _agentRegistry: Map<string, string> | null = null;

function getAgentRegistry(): Map<string, string> {
  if (!_agentRegistry) {
    _agentRegistry = loadAgentRegistry();
  }
  return _agentRegistry;
}

function parseAuthorizationHeader(header: string): { type: string; token: string } | null {
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  return { type: parts[0]!.toLowerCase(), token: parts[1]! };
}

function validateHmacSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function getSessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return DEVELOPMENT_SESSION_SECRET;
}

function encodeSessionClaims(claims: SessionClaims): string {
  return Buffer.from(JSON.stringify(claims)).toString('base64url');
}

function signSessionClaims(encodedClaims: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedClaims).digest('base64url');
}

export function createSessionToken(
  identity: AgentIdentity,
  issuedAt: number = Date.now(),
  ttlMs: number = SESSION_TTL_MS,
): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error('SESSION_SECRET must be configured in production');

  const claims: SessionClaims = {
    agentId: identity.agentId,
    roles: [...identity.roles],
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  };
  const encodedClaims = encodeSessionClaims(claims);
  return `${encodedClaims}.${signSessionClaims(encodedClaims, secret)}`;
}

export function authenticateSessionToken(token: string, now: number = Date.now()): AgentIdentity | null {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string') return null;

  try {
    const [encodedClaims, signature, ...extra] = token.split('.');
    if (!encodedClaims || !signature || extra.length > 0) return null;

    const expected = signSessionClaims(encodedClaims, secret);
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }

    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as Partial<SessionClaims>;
    if (
      typeof claims.agentId !== 'string' ||
      claims.agentId.length === 0 ||
      !Array.isArray(claims.roles) ||
      !claims.roles.every((role) => typeof role === 'string') ||
      typeof claims.issuedAt !== 'number' ||
      !Number.isFinite(claims.issuedAt) ||
      typeof claims.expiresAt !== 'number' ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= now ||
      claims.issuedAt > now + 30_000
    ) {
      return null;
    }

    return { agentId: claims.agentId, roles: claims.roles };
  } catch {
    return null;
  }
}

export function parseCookies(headerValue?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!headerValue) return cookies;

  for (const part of headerValue.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function getSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  const cookies = parseCookies(typeof cookieHeader === 'string' ? cookieHeader : undefined);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function serializeSessionCookie(
  token: string,
  options: { maxAgeSeconds?: number; secure?: boolean } = {},
): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? Math.floor(SESSION_TTL_MS / 1000);
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function serializeClearedSessionCookie(options: { secure?: boolean } = {}): string {
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function authenticateBearerToken(token: string): AgentIdentity | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (Math.abs(Date.now() - parsed.iat) > AGENT_PASS_MAX_AGE_MS) return null;

    const agentRegistry = getAgentRegistry();
    const publicKey = agentRegistry.get(parsed.agentId);

    if (publicKey) {
      const isValid = verifySignature(publicKey, `${parsed.agentId}:${parsed.iat}`, signature);
      if (!isValid) return null;
      return { agentId: parsed.agentId, roles: parsed.roles || [] };
    }

    if (!STREAM_SECRET) return null;
    const isValidHmac = validateHmacSignature(`${parsed.agentId}:${parsed.iat}`, signature, STREAM_SECRET);
    if (!isValidHmac) return null;

    return { agentId: parsed.agentId, roles: parsed.roles || [] };
  } catch {
    return null;
  }
}

export function authenticateAgentPassPrincipal(headerValue: string): AgentIdentity | null {
  try {
    if (!headerValue) return null;
    const pass = deserializePass(headerValue);
    if (!pass) return null;
    const agentRegistry = getAgentRegistry();
    const publicKey = agentRegistry.get(pass.agentId);
    if (!publicKey) return null;
    const isValid = verifyAgentPass(pass, publicKey, AGENT_PASS_MAX_AGE_MS);
    if (!isValid) return null;
    return { agentId: pass.agentId, roles: [] };
  } catch {
    return null;
  }
}

export function authenticateAgentPass(headerValue: string): string | null {
  return authenticateAgentPassPrincipal(headerValue)?.agentId || null;
}

function authenticateAgentPassHeader(headerValue: string): AgentIdentity | null {
  return authenticateAgentPassPrincipal(headerValue);
}

export function bearerAuth(opts: BearerAuthOptions = {}) {
  const { required = false, roles = [] } = opts;

  return authGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const agentPass = req.headers['x-agent-pass'] as string | undefined;

    let identity: AgentIdentity | null = null;

    if (authHeader) {
      const parsed = parseAuthorizationHeader(authHeader);
      if (parsed && parsed.type === 'bearer') {
        identity = authenticateBearerToken(parsed.token);
      }
    }

    if (!identity && agentPass) {
      identity = authenticateAgentPassHeader(agentPass);
    }

    if (!identity) {
      const sessionToken = getSessionToken(req);
      if (sessionToken) identity = authenticateSessionToken(sessionToken);
    }

    if (required && !identity) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="kudbee"');
      return res.status(401).json({ error: 'unauthorized', message: 'Valid bearer token or agent pass required' });
    }

    if (identity && roles.length > 0) {
      const hasRole = roles.some((r) => identity!.roles.includes(r));
      if (!hasRole) {
        return res.status(403).json({ error: 'forbidden', message: `Requires one of roles: ${roles.join(', ')}` });
      }
    }

    (req as any).agentId = identity?.agentId || null;
    (req as any).authenticated = !!identity;
    (req as any).agentRoles = identity?.roles || [];
    (req as any).roles = identity?.roles || [];

    return next();
  });
}

export function getAuthGuardStats() {
  return authGuard.stats();
}

declare global {
  namespace Express {
    interface Request {
      agentId?: string | null;
      authenticated?: boolean;
      agentRoles?: string[];
      roles?: string[];
    }
  }
}
