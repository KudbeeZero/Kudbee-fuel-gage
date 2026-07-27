/**
 * services/lib/zodValidationMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — Zod schema validation middleware factory.
 *
 * Each route handler that previously did manual typeof/truthiness
 * validation now uses zodValidate({ body, query, params }) which returns
 * an Express middleware. Validation errors produce structured 400 JSON
 * responses with per-field error details.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { MiddlewareGuard } from './middlewareGuard.ts';

interface ValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validationGuard = new MiddlewareGuard('zod-validator', 2, 30_000);

function formatZodError(err: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!fields[path]) fields[path] = [];
    fields[path].push(issue.message);
  }
  return fields;
}

export function zodValidate(config: ValidationConfig) {
  return validationGuard.wrap(async (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, string[]> = {};

    if (config.body) {
      const result = config.body.safeParse(req.body);
      if (!result.success) {
        Object.assign(errors, formatZodError(result.error));
      } else {
        req.body = result.data;
      }
    }

    if (config.query) {
      const result = config.query.safeParse(req.query);
      if (!result.success) {
        Object.assign(errors, formatZodError(result.error));
      } else {
        (req as any).validatedQuery = result.data;
      }
    }

    if (config.params) {
      const result = config.params.safeParse(req.params);
      if (!result.success) {
        Object.assign(errors, formatZodError(result.error));
      } else {
        (req as any).validatedParams = result.data;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Request validation failed',
        fields: errors,
      });
    }

    return next();
  });
}

export function getValidationGuardStats() {
  return validationGuard.stats();
}
