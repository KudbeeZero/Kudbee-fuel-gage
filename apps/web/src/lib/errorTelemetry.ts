/**
 * apps/web/src/lib/errorTelemetry.ts
 * ---------------------------------------------------------------------------
 * Production-grade error telemetry — Sentry-style error reporting pipeline.
 *
 * Patterns implemented:
 *  1. Error fingerprinting (deduplication by message hash)
 *  2. Breadcrumb trail (last N user actions before crash)
 *  3. Session-aware sampling (one report per fingerprint per session)
 *  4. Error telemetry POST to /api/system/error-report
 *  5. Release + environment tagging
 *  6. Browser context capture (UA, screen, path, timestamp)
 */

const MAX_BREADCRUMBS = 10;
const SESSION_FINGERPRINTS = new Map<string, number>();
const FINGERPRINT_THROTTLE_MS = 300_000; // 5 min between same fingerprint

interface Breadcrumb {
  type: 'click' | 'navigation' | 'fetch' | 'error' | 'custom';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ErrorTelemetryContext {
  panel?: string;
  traceId?: string;
}

export interface ErrorDiagnosticReceipt {
  traceId: string;
  release: string;
  timestamp: string;
  panel: string;
  fingerprint: string;
  reported: boolean;
}

const breadcrumbs: Breadcrumb[] = [];

export function addBreadcrumb(type: Breadcrumb['type'], message: string, data?: Record<string, unknown>) {
  breadcrumbs.push({ type, message, timestamp: new Date().toISOString(), data });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

function hashFingerprint(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = ((hash << 5) - hash + message.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

export function shouldReportError(message: string): boolean {
  const fp = hashFingerprint(message);
  const lastReported = SESSION_FINGERPRINTS.get(fp) || 0;
  const now = Date.now();
  if (now - lastReported < FINGERPRINT_THROTTLE_MS) return false;
  SESSION_FINGERPRINTS.set(fp, now);
  return true;
}

function createTraceId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function reportError(
  error: Error,
  componentStack?: string | null,
  context: ErrorTelemetryContext = {},
): ErrorDiagnosticReceipt {
  const message = error.message || 'Unknown error';
  const timestamp = new Date().toISOString();
  const traceId = context.traceId || createTraceId();
  const panel = context.panel || 'unknown';
  const release = (window as Window & { __KUD_VER?: string }).__KUD_VER || 'unknown';
  const fingerprint = hashFingerprint(`${panel}:${message}`);
  const reported = shouldReportError(`${panel}:${message}`);

  const payload = {
    traceId,
    panel,
    message,
    stack: error.stack?.slice(0, 2000) || '',
    componentStack: componentStack?.slice(0, 2000) || '',
    fingerprint,
    breadcrumbs: getBreadcrumbs().slice(-5),
    userAgent: navigator.userAgent.slice(0, 500),
    url: window.location.href,
    path: window.location.pathname,
    timestamp,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    release,
  };

  if (reported) {
    try {
      fetch('/api/system/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // fire-and-forget — never block the UI
    }
  }

  const receipt: ErrorDiagnosticReceipt = {
    traceId,
    release,
    timestamp,
    panel,
    fingerprint,
    reported,
  };

  window.dispatchEvent(new CustomEvent('kudbee:error-inbox', { detail: { ...payload, reported } }));

  if (import.meta.env.DEV) {
    console.error('[ErrorTelemetry]', payload);
  }

  return receipt;
}
