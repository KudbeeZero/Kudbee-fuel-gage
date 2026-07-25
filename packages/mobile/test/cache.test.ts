import { describe, it, expect, beforeEach } from 'bun:test';
import { SqliteCache } from '../src/cache/sqliteCache';

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

import { useMobileTelemetryStore } from '../src/store/useMobileTelemetryStore';

describe('SqliteCache (unmanaged memory fallback)', () => {
  let cache: SqliteCache;

  beforeEach(async () => {
    cache = new SqliteCache({ defaultTTLMs: 5000 });
    await cache.clear();
  });

  it('should store and retrieve a value', async () => {
    await cache.set('test_key', { name: 'kudbee', version: 1 });
    const val = await cache.get<{ name: string; version: number }>('test_key');
    expect(val).toBeDefined();
    expect(val?.name).toBe('kudbee');
    expect(val?.version).toBe(1);
  });

  it('should return null for missing keys', async () => {
    const val = await cache.get('nonexistent');
    expect(val).toBeNull();
  });

  it('should delete an entry', async () => {
    await cache.set('deletable', 'value');
    await cache.delete('deletable');
    const val = await cache.get('deletable');
    expect(val).toBeNull();
  });

  it('should clear all entries', async () => {
    await cache.set('k1', 1);
    await cache.set('k2', 2);
    await cache.clear();
    expect(await cache.size()).toBe(0);
  });

  it('should return keys', async () => {
    await cache.set('alpha', 1);
    await cache.set('beta', 2);
    const keys = await cache.keys();
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
  });

  it('should track cache size', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    expect(await cache.size()).toBe(2);
  });

  it('should expire entries after TTL', async () => {
    const shortCache = new SqliteCache({ defaultTTLMs: 50 });
    await shortCache.set('ephemeral', 'gone soon');
    await new Promise((r) => setTimeout(r, 100));
    const val = await shortCache.get('ephemeral');
    expect(val).toBeNull();
  });

  it('should allow per-entry TTL override', async () => {
    await cache.set('persistent', 'stays', 60_000);
    await new Promise((r) => setTimeout(r, 20));
    const val = await cache.get<string>('persistent');
    expect(val).toBe('stays');
  });
});

describe('useMobileTelemetryStore', () => {
  beforeEach(() => {
    const { clearSnapshots } = useMobileTelemetryStore.getState();
    clearSnapshots();
  });

  it('should push a snapshot to the store', () => {
    useMobileTelemetryStore.getState().pushSnapshot({
      agentId: 'agent-1',
      model: 'claude-3.5',
      tokensIn: 500,
      tokensOut: 300,
      cost: 0.0045,
      provider: 'anthropic',
      status: 'OK'
    });

    const { snapshots } = useMobileTelemetryStore.getState();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]?.agentId).toBe('agent-1');
    expect(snapshots[0]?.synced).toBe(false);
  });

  it('should enforce max snapshots cap', () => {
    for (let i = 0; i < 250; i++) {
      useMobileTelemetryStore.getState().pushSnapshot({
        agentId: `agent-${i}`,
        model: 'test',
        tokensIn: 10,
        tokensOut: 5,
        cost: 0.001,
        provider: 'test',
        status: 'OK'
      });
    }
    const { snapshots } = useMobileTelemetryStore.getState();
    expect(snapshots.length).toBe(200);
  });

  it('should update sync status for specific ids', () => {
    useMobileTelemetryStore.getState().pushSnapshot({
      agentId: 'a',
      model: 'm',
      tokensIn: 1,
      tokensOut: 1,
      cost: 0.001,
      provider: 'p',
      status: 'OK'
    });
    const id = useMobileTelemetryStore.getState().snapshots[0]!.id;
    useMobileTelemetryStore.getState().updateSyncStatus([id]);
    const updated = useMobileTelemetryStore.getState().snapshots[0]!;
    expect(updated.synced).toBe(true);
  });

  it('should push and update governance items', () => {
    useMobileTelemetryStore.getState().pushGovernanceItem({
      action: 'APPROVE_TOOL',
      agentId: 'hermes-1',
      riskLevel: 'MEDIUM',
      status: 'PENDING'
    });
    const items = useMobileTelemetryStore.getState().governanceItems;
    expect(items.length).toBe(1);
    expect(items[0]?.riskLevel).toBe('MEDIUM');

    useMobileTelemetryStore.getState().updateGovernanceStatus(items[0]!.id, 'APPROVED');
    expect(useMobileTelemetryStore.getState().governanceItems[0]?.status).toBe('APPROVED');
  });

  it('should persist layout prefs to localStorage', () => {
    useMobileTelemetryStore.getState().setLayoutPrefs({ theme: 'midnight' });
    const stored = localStorage.getItem('kudbee_mobile_layout');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.theme).toBe('midnight');
  });

  it('should track online/offline state', () => {
    expect(useMobileTelemetryStore.getState().online).toBeDefined();
    useMobileTelemetryStore.getState().setOnline(false);
    expect(useMobileTelemetryStore.getState().online).toBe(false);
    useMobileTelemetryStore.getState().setOnline(true);
    expect(useMobileTelemetryStore.getState().online).toBe(true);
  });
});
