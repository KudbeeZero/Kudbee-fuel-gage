jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiUrl: 'http://localhost:9900' } },
  expoConfigExtra: {}
}));

jest.mock('expo-application', () => ({
  getApplicationIdAsync: () => 'com.kudbee.mobile',
  getApplicationName: () => 'Kudbee'
}));

import { hermesAudit, clearTriage, resyncVector, verifyTrace, crucibleDispatch, telemetryPurge, memoryRecall, systemProbe, governanceBulkApprove, dictionaryLookup } from '../src/sdk/commands';

const originalEnv = process.env;

describe('commands', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('hermesAudit posts to /api/governance/dispatch', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ success: true, cycle: 7, traceId: 't1' })
    } as Response));
    const res = await hermesAudit();
    expect(res.success).toBe(true);
    expect(res.detail).toContain('cycle 7');
  });

  it('systemProbe returns success with service parts', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ status: 'HEALTHY', services: { postgres: { status: 'up', latencyMs: 12 }, redis: { status: 'up', latencyMs: 3 } } })
    } as Response));
    const res = await systemProbe();
    expect(res.success).toBe(true);
    expect(res.detail).toContain('PG 12ms');
    expect(res.detail).toContain('Redis 3ms');
  });

  it('telemetryPurge returns count from response', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, count: 42 })
    } as Response));
    const res = await telemetryPurge();
    expect(res.success).toBe(true);
    expect(res.detail).toBe('42 traces removed');
  });

  it('verifyTrace patches the right path', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, message: 'verified' })
    } as Response));
    const res = await verifyTrace(123);
    expect(res.success).toBe(true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/interceptor/revalidate/123');
  });

  it('memoryRecall falls back to memories array', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ memories: [{ id: 'm1', chunk: 'x', score: 0.9 }] })
    } as Response));
    const res = await memoryRecall('query');
    expect(res.success).toBe(true);
    expect(res.detail).toContain('1 memory chunks');
  });

  it('governanceBulkApprove logs failures per-item', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ success: true }) })
      .mockRejectedValueOnce(new Error('network drop'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await governanceBulkApprove();
    expect(res.success).toBe(true);
    expect(res.detail).toContain('1/2 actions approved');
    expect(res.detail).toContain('1 failed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('approve b failed'), expect.any(String));
    warn.mockRestore();
  });

  it('dictionaryLookup returns not found when missing', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ found: false })
    } as Response));
    const res = await dictionaryLookup('test');
    expect(res.success).toBe(false);
    expect(res.detail).toBe('No matching snapshot');
  });
});
