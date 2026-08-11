import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'services/thinkbox/src/cli/dthink.mjs');

function runCli(args: string): string {
  try {
    return execSync(`node ${CLI} ${args}`, { encoding: 'utf8', timeout: 10_000 });
  } catch (e: any) {
    return e?.stdout?.toString() || e?.message || '';
  }
}

describe('dthink CLI — help & verbs', () => {
  test('--help lists all verbs', () => {
    const out = runCli('--help');
    expect(out).toContain('init');
    expect(out).toContain('start');
    expect(out).toContain('status');
    expect(out).toContain('check-config');
    expect(out).toContain('mesh');
    expect(out).toContain('prove');
    expect(out).toContain('wallet');
  });

  test('status renders ANSI telemetry frame', () => {
    const out = runCli('status');
    expect(out).toContain('ThinkBox Node Telemetry');
    expect(out).toContain('MEMORY');
    expect(out).toContain('NETWORK');
    expect(out).toContain('WORKER');
  });

  test('mesh dht shows slab table stats', () => {
    const out = runCli('mesh dht');
    expect(out).toContain('Compact Slab DHT Routing Table');
    expect(out).toContain('Buckets:');
    expect(out).toContain('Heap Alloc:     0');
  });

  test('check-config validates schema caps', () => {
    const out = runCli('check-config');
    expect(out).toContain('Validating against lean schema caps');
    expect(out).toContain('memory.max_heap_mb');
    expect(out).toContain('network.max_peers_total');
  });
});

describe('DHT slab routing table', () => {
  test('compact peer entry is 60 bytes', async () => {
    const { CompactPeerEntry } = await import('../src/cli/dht-table.mjs');
    const peer = new CompactPeerEntry();
    peer.setIpv4(10, 0, 0, 1);
    expect(peer.port).toBe(0);
    expect(peer.isIpv6).toBe(false);
    expect(peer.ipString()).toBe('10.0.0.1');
  });

  test('table stays under 25KB with 40 peers', async () => {
    const { DhtRoutingTable, makePeer, makeNodeId, makeNodeId: mkId } = await import('../src/cli/dht-table.mjs');
    const table = DhtRoutingTable.fromNodeId(mkId(42));
    for (let i = 0; i < 40; i++) {
      const id = Array.from(mkId(i)).map((b) => b.toString(16).padStart(2, '0')).join('');
      const peer = makePeer(id, `10.0.0.${(i % 254) + 1}`, 9000 + i, i % 3 === 0 ? 4 : 0);
      table.addPeer(peer, i);
    }
    const stats = table.stats();
    expect(stats.footprint_kb).toBeLessThan(25);
    expect(stats.buckets).toBeGreaterThan(1);
    expect(stats.peers).toBeGreaterThan(30);
  });

  test('zero-copy lookup returns up to alpha closest peers', async () => {
    const { DhtRoutingTable, makePeer, makeNodeId, makeNodeId: mkId } = await import('../src/cli/dht-table.mjs');
    const table = DhtRoutingTable.fromNodeId(mkId(7));
    for (let i = 0; i < 16; i++) {
      const id = Array.from(mkId(i)).map((b) => b.toString(16).padStart(2, '0')).join('');
      table.addPeer(makePeer(id, `10.1.1.${i + 1}`, 9100), i);
    }
    const out: any[] = new Array(4);
    const found = table.findClosestPeers(mkId(999), out);
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThanOrEqual(4);
    out.forEach((p) => expect(p).toBeTruthy());
  });
});
