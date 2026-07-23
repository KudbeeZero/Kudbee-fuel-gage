/**
 * Centralized API client for the Control Tower.
 *
 * The dashboard points at REACT_APP_API_URL (your Heroku deployment URL).
 * When running inside the same origin (SPA served by the ingestion server),
 * the variable is unset and we fall back to same-origin relative paths so the
 * dashboard keeps working in local dev and on the deployed dyno alike.
 */
const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.REACT_APP_API_URL as string | undefined) ||
  '';

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return normalized;
  return `${API_BASE.replace(/\/$/, '')}${normalized}`;
}

function formatError(path: string, method: string, status: number, detail?: string): Error & { status: number } {
  let label = `Request to ${path} failed with status ${status}`;
  if (status === 423) label = `Slot locked: ${path} — receptor gate blocked (423)`;
  if (status === 429) label = `Rate limited: ${path} — too many requests (429)`;
  const err = new Error(detail ? `${label}: ${detail}` : label) as Error & { status: number };
  err.status = status;
  return err;
}

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers || {}) }
  });
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
  const res = await fetch(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch {}
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
  const res = await fetch(url, {
    ...init,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch {}
    const err = formatError(path, 'PATCH', res.status, detail);
    console.error(`[apiClient] PATCH ${url} → ${res.status}`, err.message);
    throw err;
  }
  return (await res.json()) as T;
}

export default apiGet;
