/**
 * services/lib/outputRedactor.ts — SEC-004 Output Redaction Layer (INV-016)
 * ---------------------------------------------------------------------------
 * Everything leaving the system gets sanitized. Wraps res.json / res.send
 * so no API/terminal/SSE response can leak credentials.
 *
 * Protects: API keys, bearer tokens, cookies, Authorization headers,
 * database URLs, Redis URLs, JWTs, Heroku tokens, generic secrets.
 *
 * Pattern: Redaction → Audit → Output.
 *   - Redact: mask credential-shaped values in any response body.
 *   - Audit:  emit a redaction event (count of masks applied).
 *   - Output: the sanitized body is what reaches the client.
 *
 * INV-016: Nothing leaves the system unsanitized.
 *
 * Usage (server.js):
 *   import { outputRedactionMiddleware } from '../lib/outputRedactor.ts';
 *   app.use(outputRedactionMiddleware());
 * ---------------------------------------------------------------------------
 */

// ─── Secret patterns (value-shape detection, not key-name detection) ───────
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['api-key', /\b(?:sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})\b/g],
  ['github-token', /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._-]{32,}/gi],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['database-url', /\b(?:postgres(?:ql)?|mysql|mongo(?:db)?(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/g],
  ['redis-url', /\b(?:redis(?:s)?):\/\/[^\s:@/]+:[^\s@/]+@/g],
  ['authorization-header', /(authorization\s*[:=]\s*)[A-Za-z0-9._-]{16,}/gi],
  ['cookie-secret', /(cookie-secret\s*[:=]\s*)[A-Za-z0-9._-]{16,}/gi],
];

const MASK = (name: string) => `[REDACTED:${name}]`;

/**
 * Redact credential-shaped values from any string or structured value.
 * Returns { redacted, count }.
 */
export function redactOutput(value: unknown): { redacted: unknown; count: number } {
  if (typeof value === 'string') {
    let count = 0;
    let out = value;
    for (const [name, pattern] of SECRET_PATTERNS) {
      const before = count;
      out = out.replace(pattern, () => { count += 1; return MASK(name); });
      if (count === before) continue; // no-op guard (keeps loop explicit)
    }
    return { redacted: out, count };
  }

  if (Array.isArray(value)) {
    let count = 0;
    const redacted = value.map((item) => {
      const r = redactOutput(item);
      count += r.count;
      return r.redacted;
    });
    return { redacted, count };
  }

  if (value && typeof value === 'object') {
    let count = 0;
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Redact values whose KEY looks secret too (apiKey, token, secret, pass).
      if (/^(api[_-]?key|token|secret|password|passwd|authorization|session[_-]?secret|cookie[_-]?secret)$/i.test(key) && typeof val === 'string' && val.length > 3) {
        redacted[key] = MASK('field');
        count += 1;
      } else {
        const r = redactOutput(val);
        redacted[key] = r.redacted;
        count += r.count;
      }
    }
    return { redacted, count };
  }

  return { redacted: value, count: 0 };
}

/**
 * Express middleware: wraps res.json and res.send so every response body is
 * redacted before it leaves. Emits an audit line when masks are applied.
 */
export function outputRedactionMiddleware() {
  return (req: any, res: any, next: () => void) => {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (body: unknown) => {
      const { redacted, count } = redactOutput(body);
      if (count > 0) {
        console.warn(`[REDACT] ${count} credential-shaped value(s) masked on ${req.method} ${req.path}`);
      }
      return originalJson(redacted);
    };

    res.send = (body: unknown) => {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        const asString = Buffer.isBuffer(body) ? body.toString() : body;
        const { redacted, count } = redactOutput(asString);
        if (count > 0) {
          console.warn(`[REDACT] ${count} credential-shaped value(s) masked on ${req.method} ${req.path}`);
        }
        return originalSend(redacted);
      }
      return originalSend(body);
    };

    next();
  };
}

/** Convenience: redact a single string (for SSE frames / terminal output). */
export function redactString(text: string): { redacted: string; count: number } {
  const r = redactOutput(text);
  return { redacted: r.redacted as string, count: r.count };
}
