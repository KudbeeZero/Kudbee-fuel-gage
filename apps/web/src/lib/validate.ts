/**
 * Simple validation wrapper for API inputs.
 * Returns null if valid, error string if invalid.
 */
export function validateInput(body: unknown, requiredFields: string[]): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const data = body as Record<string, unknown>;
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export function isSafeString(v: unknown, maxLen = 5000): v is string {
  return typeof v === 'string' && v.length <= maxLen;
}

export function isSafeNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v) && Number.isFinite(v);
}
