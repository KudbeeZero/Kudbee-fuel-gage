/**
 * services/lib/globalErrorMiddleware.ts
 * ---------------------------------------------------------------------------
 * Phase 66 — Global error handler middleware.
 *
 * Standardizes the existing inline error handler at the end of server.js
 * into a reusable, testable module. Produces structured JSON error responses
 * with trace IDs, integrates with breadcrumbs for error trace logging.
 * Never crashes the process — always returns a 5xx JSON response.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response, NextFunction } from 'express';
import { logBreadcrumb } from './breadcrumbs.ts';
import { MiddlewareGuard } from './middlewareGuard.ts';

export const errorGuard = new MiddlewareGuard('global-error-handler', 10, 60_000);

interface StructuredError {
  error: string;
  message: string;
  statusCode: number;
  traceId: string;
  timestamp: string;
  stack?: string;
}

function generateTraceId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isOperationalError(err: unknown): boolean {
  if (err instanceof SyntaxError && 'body' in err) return true;
  if (err instanceof TypeError) return true;
  if (err && typeof err === 'object' && 'type' in err) {
    return (err as any).type === 'entity.parse.failed' || (err as any).type === 'entity.too.large';
  }
  return true;
}

export function globalErrorHandler() {
  return async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    try {
    const traceId = generateTraceId();
    const statusCode = (err && typeof err === 'object' && 'statusCode' in err)
      ? (err as any).statusCode
      : (err && typeof err === 'object' && 'status' in err)
        ? (err as any).status
        : 500;

    const message = err instanceof Error ? err.message : String(err);

    if (process.env.NODE_ENV !== 'test') {
      logBreadcrumb('global-error-handler', err instanceof Error ? err : new Error(message), traceId)
        .catch(() => {});
    }

    console.error(
      `[GlobalError] ${req.method} ${req.path} → ${statusCode} [${traceId}]: ${message}`
    );

    if (res.headersSent) return;

    const body: StructuredError = {
      error: statusCode >= 500 ? 'internal_server_error' : 'request_error',
      message,
      statusCode,
      traceId,
      timestamp: new Date().toISOString(),
    };

    if (process.env.NODE_ENV !== 'production' && err instanceof Error) {
      body.stack = err.stack?.split('\n').slice(0, 5).join('\n');
    }

    return res.status(statusCode).json(body);
    } catch {
      return res.status(500).json({
        error: 'internal_server_error',
        message: 'Global error handler itself failed',
        statusCode: 500,
        traceId: generateTraceId(),
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export function getGlobalErrorStats() {
  return errorGuard.stats();
}
