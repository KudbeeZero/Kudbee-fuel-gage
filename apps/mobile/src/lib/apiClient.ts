import { API_URL } from '../config/api';

const DEFAULT_TIMEOUT_MS = 15_000;
const POST_TIMEOUT_MS = 30_000;

export class NetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!API_URL) return normalized;
  return `${API_URL.replace(/\/$/, '')}${normalized}`;
}

function formatError(path: string, method: string, status: number, detail?: string): Error & { status: number; isRateLimit?: boolean } {
  let label = `Request to ${path} failed with status ${status}`;
  if (status === 429) label = `Rate limited: ${path} — too many requests (429)`;
  const err = new Error(detail ? `${label}: ${detail}` : label) as Error & { status: number; isRateLimit?: boolean };
  err.status = status;
  if (status === 429) err.isRateLimit = true;
  return err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? anySignal([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(signal.reason); return controller.signal; }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const retryAfter = res.headers.get('Retry-After');
        const xReset = res.headers.get('X-RateLimit-Reset');
        let delay: number;
        if (retryAfter) {
          delay = parseInt(retryAfter, 10) * 1000;
        } else if (xReset) {
          delay = Math.max(0, parseInt(xReset, 10) * 1000 - Date.now());
        } else {
          const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30_000);
          const jitter = Math.random() * 1000;
          delay = baseDelay + jitter;
        }
        console.warn(`[apiClient] ${res.status} on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new NetworkError(`Request to ${url} timed out after ${timeoutMs}ms`, { cause: err });
      }
      if (err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('fetch'))) {
        if (attempt < retries) {
          const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          console.warn(`[apiClient] Network error on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await sleep(delay);
          continue;
        }
        throw new NetworkError(`Network unreachable: ${url}`, { cause: err });
      }
      throw err;
    }
  }
  throw lastError;
}

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const res = await fetchWithRetry(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers || {}) }
  }, DEFAULT_TIMEOUT_MS);
  if (!res.ok) {
    const err = formatError(path, 'GET', res.status);
    console.error(`[apiClient] GET ${url} → ${res.status}`, err.message);
    throw err;
  }
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const url = apiUrl(path);
  const res = await fetchWithRetry(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  }, POST_TIMEOUT_MS);
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    const err = formatError(path, 'POST', res.status, detail);
    console.error(`[apiClient] POST ${url} → ${res.status}`, err.message);
    throw err;
  }
  return (await res.json()) as T;
}

export async function apiPatch<T = unknown>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const url = apiUrl(path);
  const res = await fetchWithRetry(url, {
    ...init,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  }, DEFAULT_TIMEOUT_MS);
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    const err = formatError(path, 'PATCH', res.status, detail);
    console.error(`[apiClient] PATCH ${url} → ${res.status}`, err.message);
    throw err;
  }
  return (await res.json()) as T;
}

export default apiGet;
