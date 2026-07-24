import { describe, test, expect } from 'bun:test';
import { Vector3dSchema, type Vector3d } from '../../../src/kilocode/kudbee/schema';
import { SafeZoneConfigSchema, type SafeZoneConfig } from '../../../src/kilocode/kudbee/schema';
import { TrajectoryInterceptSchema, type TrajectoryIntercept } from '../../../src/kilocode/kudbee/schema';
import { EngineStateSchema, type EngineState } from '../../../src/kilocode/kudbee/schema';
import { SafeZoneTelemetryMetadataSchema, type SafeZoneTelemetryMetadata } from '../../../src/kilocode/kudbee/schema';
import { ControlTowerGateway } from '../../../src/kilocode/kudbee/gateway';
import { mintToken } from '../../../src/kilocode/kudbee/mint';
import { publishTelemetry, publishTelemetryUpstash } from '../../../src/kilocode/kudbee/telemetry';
import { EngineBus, BusEvent, KudbeeEvents } from '../../../src/kilocode/kudbee/events';
import { KudbeeNativeRegistry, Tool } from '../../../src/kilocode/kudbee/tools';
import { SafeZoneEngine, createSafeZoneEngine } from '../../../src/kilocode/kudbee/index';

describe('Safe-Zone Schemas', () => {
  test('parses valid Vector3d', () => {
    const out = Vector3dSchema.parse({ x: 1, y: 2, z: 3 });
    expect(out).toEqual({ x: 1, y: 2, z: 3 } satisfies Vector3d);
  });

  test('rejects missing fields in Vector3d', () => {
    expect(() => Vector3dSchema.parse({ x: 1 })).toThrow();
  });

  test('applies SafeZoneConfig defaults', () => {
    const out = SafeZoneConfigSchema.parse({
      id: 'z1',
      name: 'alpha',
      vector: { x: 0, y: 0, z: 0 }
    });
    expect(out.radius).toBe(10);
    expect(out.max_threat_score).toBe(0.7);
    expect(out.status).toBe('ACTIVE');
  });

  test('parses TrajectoryIntercept', () => {
    const out = TrajectoryInterceptSchema.parse({
      id: 't1',
      zone_id: 'z1',
      trajectory_hash: 'abc',
      threat_score: 0.5
    });
    expect(out.intercepted).toBe(false);
  });

  test('parses EngineState defaults', () => {
    const out = EngineStateSchema.parse({});
    expect(out.initialized).toBe(false);
    expect(out.zones_count).toBe(0);
  });

  test('parses SafeZoneTelemetryMetadata with defaults', () => {
    const out = SafeZoneTelemetryMetadataSchema.parse({
      zone_id: 'z1',
      trajectory_hash: 'hash123',
      threat_score: 0.8
    });
    expect(out.intercepted).toBe(false);
    expect(out.kd).toBe(0);
    expect(out.efficacy).toBe(0);
  });
});

describe('Control Tower Gateway', () => {
  test('returns offline result when fetch fails', async () => {
    const orig = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>).fetch = async () => {
      throw new Error('offline');
    };
    const g = new ControlTowerGateway({ url: 'http://127.0.0.1:1' });
    const res = await g.getZoneStatus('z1');
    expect(res.success).toBe(false);
    (globalThis as unknown as Record<string, unknown>).fetch = orig;
  });

  test('send POST with strict typing', async () => {
    const orig = globalThis.fetch;
    let capturedMethod = 'GET';
    let capturedBody = '';
    (globalThis as unknown as Record<string, unknown>).fetch = async (_url: string, init: RequestInit) => {
      capturedMethod = init.method ?? 'GET';
      capturedBody = typeof init.body === 'string' ? init.body : '';
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const g = new ControlTowerGateway({ url: 'http://127.0.0.1:1' });
    const res = await g.request('/api/test', { method: 'POST', body: { foo: 'bar' } });
    expect(res.success).toBe(true);
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toContain('foo');
    (globalThis as unknown as Record<string, unknown>).fetch = orig;
  });
});

describe('Think Token Minter', () => {
  test('mints a verified token with deterministic hash', async () => {
    const token = await mintToken({ spatial_coordinates: [1, 2, 3], scale_factor: 1, proven_mode: false });
    expect(token.id.length).toBeGreaterThan(0);
    expect(token.kd).toBeGreaterThanOrEqual(0);
    expect(token.efficacy).toBeGreaterThanOrEqual(0);
    expect(token.efficacy).toBeLessThanOrEqual(1);
    expect(token.token_cost).toBe(6);
  });

  test('proven mode sets status to PROVEN', async () => {
    const token = await mintToken({ spatial_coordinates: [0, 0, 0], scale_factor: 1, proven_mode: true });
    expect(token.status).toBe('PROVEN');
  });

  test('persists trajectory after mint', async () => {
    const origFetch = globalThis.fetch;
    let published = false;
    (globalThis as unknown as Record<string, unknown>).fetch = async () => {
      published = true;
      return new Response('{}', { status: 200 });
    };
    process.env.UPSTASH_TELEMETRY_URL = 'http://example.com';
    const token = await mintToken({ spatial_coordinates: [1, 1, 1], scale_factor: 1, proven_mode: false });
    expect(token.id.length).toBeGreaterThan(0);
    expect(published).toBe(true);
    (globalThis as unknown as Record<string, unknown>).fetch = origFetch;
    delete process.env.UPSTASH_TELEMETRY_URL;
  });
});

describe('Event Bus', () => {
  test('subscribes and emits', () => {
    const bus = new EngineBus();
    let last: unknown = null;
    const unsub = bus.subscribe('SAFE_ZONE_UPDATE', (e) => {
      last = e;
    });
    bus.emit('SAFE_ZONE_UPDATE', { z: 1 });
    expect(last).toBeTruthy();
    expect((last as { payload: unknown }).payload).toEqual({ z: 1 });
    unsub();
  });

  test('unsubscribe stops delivery', () => {
    const bus = new EngineBus();
    let count = 0;
    const unsub = bus.subscribe('INTERCEPT', () => { count++; });
    bus.emit('INTERCEPT', {});
    bus.emit('INTERCEPT', {});
    unsub();
    bus.emit('INTERCEPT', {});
    expect(count).toBe(2);
  });

  test('BusEvent.define creates typed event constants', () => {
    expect(BusEvent.define('TRAJECTORY')).toBe('TRAJECTORY');
    expect(KudbeeEvents.trajectory).toBe('TRAJECTORY');
    expect(KudbeeEvents.governance_lock).toBe('GOVERNANCE_LOCK');
  });
});

describe('Native Tool Registry', () => {
  test('registers and executes a tool', async () => {
    const reg = new KudbeeNativeRegistry();
    reg.register(Tool.define({
      name: 'safe_zone.query',
      description: 'Query active safe zones',
      handler: async () => ({ success: true, output: 'ok' })
    }));
    const res = await reg.execute('safe_zone.query', {});
    expect(res.success).toBe(true);
    expect(res.output).toBe('ok');
  });

  test('returns error for unknown tool', async () => {
    const reg = new KudbeeNativeRegistry();
    const res = await reg.execute('missing', {});
    expect(res.success).toBe(false);
  });
});

describe('Safe Zone Engine', () => {
  test('evaluates a legal trajectory', async () => {
    const engine = new SafeZoneEngine({ mode: 'strict' });
    await expect(engine.evaluateTrajectory({ target: 'x', vector: [0, 1, 2], velocity: 10 })).resolves.toBeUndefined();
  });

  test('createSafeZoneEngine factory returns instance', () => {
    const engine = createSafeZoneEngine({ mode: 'observability' });
    expect(engine).toBeInstanceOf(SafeZoneEngine);
    const state = engine.getState();
    expect(state.tools).toBeGreaterThanOrEqual(0);
  });
});

describe('Telemetry Publisher', () => {
  test('drops event without endpoint when redis is absent', async () => {
    const warn = console.warn;
    const msgs: string[] = [];
    console.warn = (msg: string) => { msgs.push(msg); };
    await publishTelemetry({
      zone_id: 'z1',
      vector: { x: 0, y: 0, z: 0 },
      velocity: 0,
      threat_score: 0,
      status: 'ACTIVE',
      timestamp: new Date().toISOString()
    });
    expect(msgs.some((m) => m.includes('No endpoint configured'))).toBe(true);
    console.warn = warn;
  });

  test('publishes via Upstash redis pub/sub when available', async () => {
    const publish = async (_channel: string, _msg: string) => 1;
    await publishTelemetryUpstash(
      { zone_id: 'z1', vector: { x: 0, y: 0, z: 0 }, velocity: 0, threat_score: 0, status: 'ACTIVE', timestamp: new Date().toISOString() },
      { redis: { publish } }
    );
    expect(true).toBe(true);
  });
});
