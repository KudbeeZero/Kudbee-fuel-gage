/**
 * services/lib/capabilityMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 5C — capability middleware with CONTROLLED enforcement.
 *
 * Runs after authentication. Resolves the agent's capability set and attaches
 * it as `req.kudbeeCapabilities` / `req.capabilityContext`.
 *
 * Enforcement is PARTIAL: only the three highest-risk capability classes are
 * enforced (absence → 403). Everything else remains observe-only.
 *
 *   ENFORCED: execute:terminal, execute:fs, execute:shell
 *   OBSERVE:  every other capability
 *
 * It augments — and does NOT replace — bearer auth, tenant checks, RBAC, or
 * protectedBoundary.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveCapabilities, endpointCapability, ENFORCED_CAPABILITIES } from './capabilityRegistry.ts';
import { recordCapabilityDecision } from './capabilityTelemetry.ts';

export function capabilityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const agentId = (req as any).agentId || null;
    const roles = (req as any).roles || [];
    const ctx = resolveCapabilities({ agentId, roles });

    (req as any).kudbeeCapabilities = ctx.capabilities;
    (req as any).capabilityContext = ctx;

    const required = endpointCapability(req.path);
    const allowed = !required || ctx.capabilities.includes(required);
    const enforced = !!required && ENFORCED_CAPABILITIES.includes(required);

    if (enforced && !allowed) {
      // Default-deny for the high-risk surfaces. Command/fs/shell never runs.
      recordCapabilityDecision({
        agent: agentId,
        route: req.path,
        required,
        allowed: false,
        enforcement: 'enforce',
        ts: Date.now(),
      });
      return res.status(403).json({ error: 'forbidden', message: `Capability required: ${required}` });
    }

    recordCapabilityDecision({
      agent: agentId,
      route: req.path,
      required,
      allowed,
      enforcement: enforced ? 'enforce' : 'observe',
      ts: Date.now(),
    });
    return next();
  };
}
