/**
 * services/lib/capabilityMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 5B — capability resolution middleware (OBSERVATION ONLY, no deny).
 *
 * Runs after authentication has established the principal. Resolves the
 * agent's capability set and attaches it to the request as
 * `req.kudbeeCapabilities` / `req.capabilityContext`. It records capability
 * decisions for observability but NEVER returns 403 in this phase.
 *
 * It augments — and does NOT replace — bearer auth, tenant checks, RBAC, or
 * protectedBoundary.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveCapabilities, endpointCapability } from './capabilityRegistry.ts';
import { recordCapabilityDecision } from './capabilityTelemetry.ts';

export function capabilityMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const agentId = (req as any).agentId || null;
    const roles = (req as any).roles || [];
    const ctx = resolveCapabilities({ agentId, roles });

    (req as any).kudbeeCapabilities = ctx.capabilities;
    (req as any).capabilityContext = ctx;

    // Observability only — never deny.
    const required = endpointCapability(req.path);
    const allowed = !required || ctx.capabilities.includes(required);
    recordCapabilityDecision({
      agent: agentId,
      route: req.path,
      required,
      allowed,
      enforcement: 'observe',
      ts: Date.now(),
    });

    return next();
  };
}
