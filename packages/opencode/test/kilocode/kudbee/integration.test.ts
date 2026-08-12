import { describe, test, expect, beforeAll } from 'bun:test';
import { SafeZoneEngine, Kudbee, createSafeZoneEngine } from '../../../src/kilocode/kudbee/index';
import { mintToken, ThinkTokenMinter } from '../../../src/kilocode/kudbee/mint';
import { publishTelemetry, publishTelemetryUpstash, setupTelemetryListeners } from '../../../src/kilocode/kudbee/telemetry';
import { ControlTowerGateway } from '../../../src/kilocode/kudbee/gateway';
import { EngineBus, KudbeeEvents } from '../../../src/kilocode/kudbee/events';
import { KudbeeNativeRegistry, Tool, registerKudbeeNativeTools, registerKudbeeRecallAndMintTools, registerKudbeeGovernanceTools } from '../../../src/kilocode/kudbee/tools';
import { GovernanceProposalSchema, type GovernanceProposal } from '../../../src/kilocode/kudbee/schema';

describe('Kudbee Engine Integration', () => {
  test('Kudbee namespace provides singleton Instance and state', () => {
    const a = Kudbee.Instance({ mode: 'strict' });
    const b = Kudbee.Instance({ mode: 'observability' });
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(SafeZoneEngine);
    const state = Kudbee.state();
    expect(state).toHaveProperty('zones');
    expect(state).toHaveProperty('tools');
    Kudbee.reset();
  });

  test('createSafeZoneEngine factory returns new instance', () => {
    const engine = createSafeZoneEngine({ mode: 'observability' });
    expect(engine).toBeInstanceOf(SafeZoneEngine);
  });

  test('SafeZoneEngine evaluates trajectory and emits events', async () => {
    const bus = new EngineBus();
    const engine = new SafeZoneEngine({ mode: 'strict' });
    const events: unknown[] = [];
    const unsub = bus.subscribe('SAFE_ZONE_UPDATE', (e) => events.push(e));
    engine['bus'] = bus;

    await engine.evaluateTrajectory({ target: 'alpha', vector: [1, 2, 3], velocity: 50 });
    expect(events.length).toBe(1);
    unsub();
  });

  test('bootstrap emits TRAJECTORY_UPDATE and registers tools', async () => {
    const engine = new SafeZoneEngine({ mode: 'strict' });
    const gateway = new ControlTowerGateway({ url: 'http://127.0.0.1:1' });
    await engine.bootstrap('/tmp');
    const tools = engine['registry'].list();
    expect(tools.some((t) => t.name === 'safe_zone.query')).toBe(true);
  });
});

describe('Telemetry Integration', () => {
  test('setupTelemetryListeners wires BusEvent.define events', async () => {
    const bus = new EngineBus();
    const messages: unknown[] = [];
    const unsub = bus.subscribe(KudbeeEvents.trajectory, (e) => messages.push(e));
    bus.emit(KudbeeEvents.trajectory, { zone_id: 'z1', threat_score: 0.5 });
    expect(messages.length).toBe(1);
    unsub();
  });

  test('publishTelemetry drops without endpoint', async () => {
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

  test('publishTelemetryUpstash uses redis when provided', async () => {
    const publish = async (_channel: string, _msg: string) => 1;
    await publishTelemetryUpstash(
      { zone_id: 'z1', vector: { x: 0, y: 0, z: 0 }, velocity: 0, threat_score: 0, status: 'ACTIVE', timestamp: new Date().toISOString() },
      { redis: { publish } }
    );
    expect(true).toBe(true);
  });
});

describe('Native Tools Integration', () => {
  test('registerKudbeeNativeTools populates registry with recall, mint, governance', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeNativeTools(registry);
    const list = registry.list();
    expect(list.some((t) => t.name === 'kudbee_recall_memories')).toBe(true);
    expect(list.some((t) => t.name === 'kudbee_mint_think_token')).toBe(true);
    expect(list.some((t) => t.name === 'kudbee_propose_governance')).toBe(true);
  });

  test('registerKudbeeRecallAndMintTools populates recall and mint', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeRecallAndMintTools(registry);
    const list = registry.list();
    expect(list.some((t) => t.name === 'kudbee_recall_memories')).toBe(true);
    expect(list.some((t) => t.name === 'kudbee_mint_think_token')).toBe(true);
    expect(list.some((t) => t.name === 'kudbee_propose_governance')).toBe(false);
  });

  test('registerKudbeeGovernanceTools populates governance', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeGovernanceTools(registry);
    const list = registry.list();
    expect(list.some((t) => t.name === 'kudbee_propose_governance')).toBe(true);
    expect(list.some((t) => t.name === 'kudbee_recall_memories')).toBe(false);
  });

  test('kudbee_recall_memories returns structured output', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeNativeTools(registry);
    const res = await registry.execute('kudbee_recall_memories', { query: 'test', limit: 3 });
    expect(res.success).toBe(true);
    const parsed = JSON.parse(res.output);
    expect(parsed.query).toBe('test');
    expect(parsed.limit).toBe(3);
  });

  test('kudbee_mint_think_token mints via mintToken', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeNativeTools(registry);
    const res = await registry.execute('kudbee_mint_think_token', {
      spatial_coordinates: [1, 2, 3],
      scale_factor: 1,
      proven_mode: false
    });
    expect(res.success).toBe(true);
    const parsed = JSON.parse(res.output);
    expect(parsed.id).toBeTruthy();
    expect(parsed.token_hash).toBeTruthy();
  });

  test('kudbee_propose_governance returns proposal', async () => {
    const registry = new KudbeeNativeRegistry();
    registerKudbeeNativeTools(registry);
    const res = await registry.execute('kudbee_propose_governance', {
      title: 'Test Proposal',
      description: 'Integration test governance action',
      risk_level: 'HIGH'
    });
    expect(res.success).toBe(true);
    const parsed = JSON.parse(res.output);
    expect(parsed.title).toBe('Test Proposal');
    expect(parsed.status).toBe('PENDING');
  });

  test('ThinkTokenMinter packages trajectory', async () => {
    const minter = new ThinkTokenMinter();
    const token = await minter.mint({ spatial_coordinates: [1, 2, 3], scale_factor: 1, proven_mode: false });
    const packaged = await minter.packageTrajectory(token);
    const parsed = JSON.parse(packaged);
    expect(parsed.id).toBe(token.id);
    expect(parsed.hash).toBe(token.token_hash);
  });
});

describe('Governance Schema', () => {
  test('parses valid GovernanceProposal', () => {
    const out = GovernanceProposalSchema.parse({
      id: 'g1',
      title: 'Deploy v2',
      description: 'Push to production',
      risk_level: 'HIGH',
      status: 'PENDING'
    });
    expect(out).toEqual({
      id: 'g1',
      title: 'Deploy v2',
      description: 'Push to production',
      risk_level: 'HIGH',
      status: 'PENDING'
    });
  });

  test('applies defaults', () => {
    const out = GovernanceProposalSchema.parse({
      id: 'g2',
      title: 'Minor fix',
      description: 'Hotfix'
    });
    expect(out.risk_level).toBe('MEDIUM');
    expect(out.status).toBe('PENDING');
  });
});

describe('Control Tower Gateway Integration', () => {
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
