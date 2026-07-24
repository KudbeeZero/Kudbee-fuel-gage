export interface ApiResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

class ControlTowerGateway {
  private readonly base: string;

  constructor(opts?: { url?: string }) {
    this.base = opts?.url ?? process.env.CONTROL_TOWER_URL ?? 'http://localhost:3001';
  }

  async request(path: string, opts?: RequestOptions): Promise<ApiResult> {
    try {
      const init: RequestInit = {
        method: opts?.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(opts?.headers ?? {})
        }
      };
      if (opts?.body) {
        init.body = JSON.stringify(opts.body);
      }
      const res = await fetch(`${this.base}${path}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      return { success: true, data: body };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getZoneStatus(zoneId: string): Promise<ApiResult> {
    return this.request(`/api/zones/${encodeURIComponent(zoneId)}/status`);
  }
}

export { ControlTowerGateway };
