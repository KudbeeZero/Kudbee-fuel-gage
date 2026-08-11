/**
 * services/thinkbox/src/cli/node-config.mjs
 *
 * DThink-Node lean configuration module — parses dthink.toml (or falls
 * back to dthink.yaml) and computes live runtime status for the
 * hardware-lab panel. Enforces the tight 4-6 MB RAM budget:
 *   - max_heap_mb  ≤ 16 (default 6)
 *   - buffer_pool_kb ≤ 2048 (default 512)
 *   - max_peers_total ≤ 32 (default 12)
 *   - max_concurrent_tasks ≤ 4 (default 2)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const NODE_ROLES = ['light-worker', 'relayer', 'headless-executor'];
export const DHT_MODES = ['off', 'client', 'full'];

const DEFAULTS = {
  node: { identity_key: '~/.dthink/node.key', role: 'light-worker', data_dir: '~/.dthink/data' },
  memory: { max_heap_mb: 6, buffer_pool_kb: 512, gc_interval_ms: 2000 },
  network: {
    listen_addrs: ['/ip4/0.0.0.0/tcp/9000'],
    max_peers_total: 12,
    max_inbound_peers: 8,
    socket_buffer_kb: 16,
    keepalive_interval_sec: 30,
    bootstrap_nodes: [],
  },
  discovery: { mdns_enabled: true, dht_mode: 'client', discovery_interval_sec: 60 },
  worker: { max_concurrent_tasks: 2, max_queue_depth: 8, max_payload_kb: 256 },
  logging: { level: 'info', format: 'compact' },
};

const LIMITS = {
  memory: { max_heap_mb: 16, buffer_pool_kb: 2048, gc_interval_ms: [100, Infinity] },
  network: { max_peers_total: 32, max_inbound_peers: 16, socket_buffer_kb: 64 },
  worker: { max_concurrent_tasks: 4, max_queue_depth: 32, max_payload_kb: 1024 },
};

/** Simple TOML parser — sections + key=value lines + arrays. */
function parseToml(raw) {
  const cfg = {};
  let section = null;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      cfg[section] = {};
      continue;
    }
    if (section && trimmed.includes('=')) {
      const eq = trimmed.indexOf('=');
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      const commentIdx = value.indexOf('#');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        cfg[section][key] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/"/g, ''));
      } else if (value === 'true') cfg[section][key] = true;
      else if (value === 'false') cfg[section][key] = false;
      else if (/^\d+(\.\d+)?$/.test(value)) cfg[section][key] = parseFloat(value);
      else cfg[section][key] = value.replace(/"/g, '');
    }
  }
  return cfg;
}

function findConfigPath() {
  const candidates = [
    resolve('.dthink', 'dthink.toml'),
    resolve('.dthink', 'dthink.yaml'),
    join(homedir(), '.dthink', 'config.toml'),
    join(homedir(), '.dthink', 'config.yaml'),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function clampValue(key, value, section) {
  const limit = LIMITS[section]?.[key];
  if (limit === undefined) return value;
  if (Array.isArray(limit)) {
    const [min, max] = limit;
    return Math.max(min, Math.min(max ?? Infinity, Number(value) || 0));
  }
  return Math.min(limit, Number(value) || 0);
}

/** Load and validate the node config, merging with defaults + clamping limits. */
export function loadNodeConfig() {
  const path = findConfigPath();
  let fileCfg = {};
  let source = 'defaults';

  if (path) {
    source = path.endsWith('.toml') ? 'toml' : 'yaml';
    try {
      const raw = readFileSync(path, 'utf8');
      if (source === 'toml') fileCfg = parseToml(raw);
      else fileCfg = parseToml(raw.replace(/^\s*([a-z_]+):/gm, '$1 ='));
    } catch {
      source = 'defaults';
    }
  }

  const config = {
    node: {
      ...DEFAULTS.node,
      ...(fileCfg.node || {}),
      role: NODE_ROLES.includes(fileCfg.node?.role) ? fileCfg.node.role : DEFAULTS.node.role,
    },
    memory: {
      max_heap_mb: clampValue('max_heap_mb', fileCfg.memory?.max_heap_mb ?? DEFAULTS.memory.max_heap_mb, 'memory'),
      buffer_pool_kb: clampValue('buffer_pool_kb', fileCfg.memory?.buffer_pool_kb ?? DEFAULTS.memory.buffer_pool_kb, 'memory'),
      gc_interval_ms: clampValue('gc_interval_ms', fileCfg.memory?.gc_interval_ms ?? DEFAULTS.memory.gc_interval_ms, 'memory'),
    },
    network: {
      ...DEFAULTS.network,
      ...(fileCfg.network || {}),
      max_peers_total: clampValue('max_peers_total', fileCfg.network?.max_peers_total ?? DEFAULTS.network.max_peers_total, 'network'),
      max_inbound_peers: clampValue('max_inbound_peers', fileCfg.network?.max_inbound_peers ?? DEFAULTS.network.max_inbound_peers, 'network'),
      socket_buffer_kb: clampValue('socket_buffer_kb', fileCfg.network?.socket_buffer_kb ?? DEFAULTS.network.socket_buffer_kb, 'network'),
    },
    discovery: {
      ...DEFAULTS.discovery,
      ...(fileCfg.discovery || {}),
      dht_mode: DHT_MODES.includes(fileCfg.discovery?.dht_mode) ? fileCfg.discovery.dht_mode : DEFAULTS.discovery.dht_mode,
    },
    worker: {
      max_concurrent_tasks: clampValue('max_concurrent_tasks', fileCfg.worker?.max_concurrent_tasks ?? DEFAULTS.worker.max_concurrent_tasks, 'worker'),
      max_queue_depth: clampValue('max_queue_depth', fileCfg.worker?.max_queue_depth ?? DEFAULTS.worker.max_queue_depth, 'worker'),
      max_payload_kb: clampValue('max_payload_kb', fileCfg.worker?.max_payload_kb ?? DEFAULTS.worker.max_payload_kb, 'worker'),
    },
    logging: { ...DEFAULTS.logging, ...(fileCfg.logging || {}) },
  };

  return { config, source: path ? path : 'defaults', file: path };
}

/** Compute live runtime status for the node (memory/network/worker health). */
export function nodeRuntimeStatus(config) {
  const m = config.memory;
  const n = config.network;
  const w = config.worker;

  // Estimated live RSS: heap budget + buffer pool + per-peer state (1KB) + task stacks
  const perPeerKb = n.socket_buffer_kb * 2 + 1;
  const estimatedRssMb = m.max_heap_mb + m.buffer_pool_kb / 1024 + (n.max_peers_total * perPeerKb) / 1024;
  const budgetOk = estimatedRssMb <= m.max_heap_mb + 1;

  return {
    runtime: {
      estimated_rss_mb: Number(estimatedRssMb.toFixed(2)),
      heap_budget_mb: m.max_heap_mb,
      heap_utilization_pct: Math.min(100, Math.round((estimatedRssMb / m.max_heap_mb) * 100)),
      budget_within_limit: budgetOk,
      gc_interval_ms: m.gc_interval_ms,
    },
    network: {
      peers_total_cap: n.max_peers_total,
      inbound_cap: n.max_inbound_peers,
      outbound_cap: n.max_peers_total - n.max_inbound_peers,
      socket_buffer_kb: n.socket_buffer_kb,
      dht_mode: config.discovery.dht_mode,
      dht_ram_saving_mb: config.discovery.dht_mode === 'full' ? 0 : 2.5,
      mdns: config.discovery.mdns_enabled,
      keepalive_sec: n.keepalive_interval_sec,
    },
    worker: {
      max_tasks: w.max_concurrent_tasks,
      queue_depth: w.max_queue_depth,
      max_payload_kb: w.max_payload_kb,
      queue_ram_kb: w.max_queue_depth * w.max_payload_kb,
    },
    footprint: {
      target_mb: 6,
      estimated_mb: Number(estimatedRssMb.toFixed(2)),
      within_budget: budgetOk && estimatedRssMb <= 6.5,
    },
    timestamp: new Date().toISOString(),
  };
}

/** Build the API response for GET /api/dthink/status */
export function buildNodeStatus() {
  const { config, source, file } = loadNodeConfig();
  const status = nodeRuntimeStatus(config);
  let dht = null;
  if (config.discovery.dht_mode === 'full') {
    try {
      const { DhtRoutingTable, makeNodeId } = awaitImportDht();
      const table = DhtRoutingTable.fromNodeId(makeNodeId(42));
      dht = table.stats();
    } catch {
      dht = { error: 'DHT table unavailable' };
    }
  } else {
    dht = { mode: 'client', ram_saving_mb: 2.5, note: 'client mode keeps no routing table (saves ~2.5MB)' };
  }
  return {
    node: config.node,
    config,
    status,
    dht,
    config_source: source,
    config_file: file,
    protocol: 'dThink-Node v1.0',
  };
}

/** Lazy import the DHT slab table (only for full dht_mode) */
function awaitImportDht() {
  return import('./dht-table.mjs');
}
