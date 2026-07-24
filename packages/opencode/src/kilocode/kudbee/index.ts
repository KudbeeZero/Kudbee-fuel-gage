import { SafeZoneConfigSchema, type SafeZoneConfig, SafeZoneEngineConfigSchema, type SafeZoneEngineConfig } from './schema';
import { ControlTowerGateway } from './gateway';
import { mintToken } from './mint';
import { publishTelemetry } from './telemetry';
import { EngineBus, EngineEventType } from './events';
import { KudbeeNativeRegistry, type NativeToolEntry } from './tools';
import { TelemetryEventSchema, type TelemetryEvent, type MintedToken } from './schema';
import { randomUUID } from 'crypto';

export class SafeZoneEngine {
  private cfg: SafeZoneEngineConfig;
  private bus = new EngineBus();
  private registry = new KudbeeNativeRegistry();

  constructor(cfg?: Partial<SafeZoneEngineConfig>) {
    this.cfg = { mode: 'strict', autoBootstrap: false, ...cfg };
  }

  getState() {
    return {
      zones: this.bus,
      tools: this.registry.list().length
    };
  }

  async evaluateTrajectory(opts: {
    target: string;
    vector: [number, number, number];
    velocity: number;
  }): Promise<void> {
    const [vx, vy, vz] = opts.vector;
    const zone: SafeZoneConfig = {
      id: randomUUID(),
      name: `zone-${opts.target}`,
      vector: { x: vx, y: vy, z: vz },
      radius: 10,
      max_threat_score: 0.7,
      lockout_duration_ms: 5000,
      status: 'ACTIVE',
      owner: 'safe-zone-engine'
    };

    const threatScore = Math.min(1, opts.velocity / 100);
    const status = threatScore > zone.max_threat_score ? 'BREACHED' : 'ACTIVE';

    this.bus.emit('SAFE_ZONE_UPDATE', { zoneId: zone.id, status, threatScore });

    if (status === 'BREACHED') {
      const token: MintedToken = await mintToken({
        spatial_coordinates: opts.vector,
        scale_factor: 1,
        proven_mode: false
      });
      this.bus.emit('INTERCEPT', { tokenId: token.id, zoneId: zone.id });
    }

    const evt: TelemetryEvent = {
      zone_id: zone.id,
      vector: { x: vx, y: vy, z: vz },
      velocity: opts.velocity,
      threat_score: threatScore,
      status,
      timestamp: new Date().toISOString()
    };

    await publishTelemetry(evt);
  }

  async bootstrap(workspaceRoot: string): Promise<void> {
    const gateway = new ControlTowerGateway();
    this.bus.emit('TRAJECTORY_UPDATE', { workspaceRoot, status: 'BOOTSTRAPPED' });

    this.registry.register({
      name: 'safe_zone.query',
      description: 'Query active safe zones',
      handler: async () => ({ success: true, output: 'Engine active' })
    });

    const result = await gateway.getZoneStatus('bootstrap');
    this.bus.emit('TRAJECTORY_UPDATE', { status: 'READY', payload: result });
  }
}
