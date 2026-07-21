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

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers || {}) }
  });
  if (!res.ok) {
    const err = new Error(`Request to ${path} failed with status ${res.status}`) as Error & {
      status: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(path), {
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
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    const err = new Error(
      `POST ${path} failed with status ${res.status}${detail ? `: ${detail}` : ''}`
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export async function apiPatch<T = unknown>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(path), {
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
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    const err = new Error(
      `PATCH ${path} failed with status ${res.status}${detail ? `: ${detail}` : ''}`
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export default apiGet;
