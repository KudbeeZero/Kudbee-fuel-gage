/**
 * services/lib/bearerAuthMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — Centralized bearer token authentication guard.
 *
 * Extracts Authorization: Bearer <token> from incoming requests, validates
 * against AGENT_REGISTRY or HMAC secret, and attaches req.agentId and
 * req.authenticated. Supports optional auth (skipped for public routes)
 * and role-based access control.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { deserializePass, verifyAgentPass, verifySignature, AGENT_PASS_MAX_AGE_MS } from '@kudbee/utils';
import { MiddlewareGuard } from './middlewareGuard.ts';

const STREAM_SECRET = process.env.STREAM_SECRET || crypto.randomBytes(32).toString('hex');

interface AgentIdentity {
  agentId: string;
  roles: string[];
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
    const fs = require('node:fs');
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

    const isValidHmac = validateHmacSignature(`${parsed.agentId}:${parsed.iat}`, signature, STREAM_SECRET);
    if (!isValidHmac) return null;

    return { agentId: parsed.agentId, roles: parsed.roles || [] };
  } catch {
    return null;
  }
}

function authenticateAgentPassHeader(headerValue: string): AgentIdentity | null {
  try {
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
    }
  }
}
