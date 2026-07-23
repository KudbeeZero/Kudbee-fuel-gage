jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiUrl: 'http://localhost:9900' } },
  expoConfigExtra: {}
}));

jest.mock('expo-application', () => ({
  getApplicationIdAsync: () => 'com.kudbee.mobile',
  getApplicationName: () => 'Kudbee'
}));

import { apiGet, apiPost, apiPatch, apiUrl, NetworkError } from '../src/lib/apiClient';

const originalEnv = process.env;

describe('apiClient', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('constructs URLs with API_URL', () => {
    process.env.API_URL = 'http://localhost:9900';
    expect(apiUrl('/api/health')).toBe('http://localhost:9900/api/health');
  });

  it('returns NetworkError on timeout', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10);
    global.fetch = jest.fn(() => new Promise((_, reject) => {
      const signal = controller.signal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })) as any;
    await expect(apiGet('/api/health', { signal: controller.signal })).rejects.toThrow(NetworkError);
    clearTimeout(timer);
  });

  it('classifies 429 as rate limited error', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 429,
      ok: false,
      headers: new Map(),
      json: async () => ({})
    } as unknown as Response));
    await expect(apiPost('/api/test', {})).rejects.toThrow('Rate limited');
  });

  it('classifies 503 as retryable then fails after retries', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 503,
      ok: false,
      headers: new Map(),
      json: async () => ({})
    } as unknown as Response));
    await expect(apiGet('/api/test')).rejects.toThrow('Request to /api/test failed with status 503');
  });
});
