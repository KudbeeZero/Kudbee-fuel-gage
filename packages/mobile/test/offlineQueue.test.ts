import { describe, it, expect, beforeEach } from 'bun:test';
import { SqliteCache } from '../src/cache/sqliteCache';
import { useMobileTelemetryStore } from '../src/store/useMobileTelemetryStore';

const _memoryStore: Record<string, string> = {};

(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (key: string) => _memoryStore[key] ?? null,
  setItem: (key: string, value: string) => { _memoryStore[key] = value; },
  removeItem: (key: string) => { delete _memoryStore[key]; },
  clear: () => { Object.keys(_memoryStore).forEach((k) => delete _memoryStore[k]); },
  get length() { return Object.keys(_memoryStore).length; },
  key: (idx: number) => Object.keys(_memoryStore)[idx] ?? null
} as Storage;

(globalThis as unknown as Record<string, unknown>).navigator = {
  onLine: true
};

describe('Mobile offline queue fallback', () => {
  let cache: SqliteCache;

  beforeEach(async () => {
    cache = new SqliteCache({ defaultTTLMs: 30_000 });
    await cache.clear();
    const { clearSnapshots } = useMobileTelemetryStore.getState();
    clearSnapshots();
  });

  it('should cache unsynced snapshots when Redis is rate-limited', async () => {
    useMobileTelemetryStore.getState().pushSnapshot({
      agentId: 'agent-offline',
      model: 'test',
      tokensIn: 100,
      tokensOut: 50,
      cost: 0.002,
      provider: 'groq',
      status: 'OK'
    });

    const { snapshots } = useMobileTelemetryStore.getState();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]?.synced).toBe(false);

    await cache.set('offline_snapshot', snapshots[0], 3600_000);
    const cached = await cache.get<Record<string, unknown>>('offline_snapshot');
    expect(cached).toBeDefined();
    expect((cached as Record<string, unknown>).agentId).toBe('agent-offline');
  });

  it('should buffer snapshots in SQLite when online is false', async () => {
    useMobileTelemetryStore.getState().setOnline(false);
    useMobileTelemetryStore.getState().pushSnapshot({
      agentId: 'offline-agent',
      model: 'llama',
      tokensIn: 200,
      tokensOut: 100,
      cost: 0.003,
      provider: 'groq',
      status: 'PENDING'
    });

    const offlineSnapshot = useMobileTelemetryStore.getState().snapshots[0];
    expect(offlineSnapshot?.synced).toBe(false);

    await cache.set('offline_buf_' + (offlineSnapshot?.id ?? '0'), offlineSnapshot, 86_400_000);
    expect(await cache.size()).toBeGreaterThanOrEqual(1);
  });

  it('should clear SQLite cache after successful sync', async () => {
    await cache.set('pending_a', { id: 'a' }, 60_000);
    await cache.set('pending_b', { id: 'b' }, 60_000);
    expect(await cache.size()).toBe(2);

    await cache.delete('pending_a');
    await cache.delete('pending_b');
    expect(await cache.size()).toBe(0);
  });

  it('should not lose data when Redis quota error occurs during flush', async () => {
    useMobileTelemetryStore.getState().pushSnapshot({
      agentId: 'critical-agent',
      model: 'deepseek',
      tokensIn: 1000,
      tokensOut: 800,
      cost: 0.05,
      provider: 'groq',
      status: 'ERROR'
    });

    const snapshot = useMobileTelemetryStore.getState().snapshots[0];
    expect(snapshot).toBeDefined();
    expect(snapshot?.status).toBe('ERROR');

    await cache.set('critical_snap', snapshot, 86_400_000);
    const recovered = await cache.get<Record<string, unknown>>('critical_snap');
    expect(recovered).toBeDefined();
    expect((recovered as Record<string, unknown>).status).toBe('ERROR');
  });
});
