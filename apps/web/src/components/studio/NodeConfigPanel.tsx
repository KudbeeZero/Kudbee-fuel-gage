import { useCallback, useEffect, useState } from 'react';
import { Cpu, MemoryStick, Network, Workflow, Database, Shield } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface NodeConfig {
  protocol: string;
  config_source: string;
  config_file: string;
  config: {
    node: { identity_key: string; role: string; data_dir: string };
    memory: { max_heap_mb: number; buffer_pool_kb: number; gc_interval_ms: number };
    network: {
      listen_addrs: string[];
      max_peers_total: number;
      max_inbound_peers: number;
      socket_buffer_kb: number;
      keepalive_interval_sec: number;
      bootstrap_nodes: string[];
    };
    discovery: { mdns_enabled: boolean; dht_mode: string; discovery_interval_sec: number };
    worker: { max_concurrent_tasks: number; max_queue_depth: number; max_payload_kb: number };
    logging: { level: string; format: string };
  };
}

interface NodeStatus {
  node: { identity_key: string; role: string; data_dir: string };
  status: {
    runtime: { estimated_rss_mb: number; heap_budget_mb: number; heap_utilization_pct: number; budget_within_limit: boolean; gc_interval_ms: number };
    network: { peers_total_cap: number; inbound_cap: number; outbound_cap: number; socket_buffer_kb: number; dht_mode: string; dht_ram_saving_mb: number; mdns: boolean; keepalive_sec: number };
    worker: { max_tasks: number; queue_depth: number; max_payload_kb: number; queue_ram_kb: number };
    footprint: { target_mb: number; estimated_mb: number; within_budget: boolean };
  };
  config_source: string;
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
      ok ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    }`}>{children}</span>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <h4 className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function KV({ k, v, ok }: { k: string; v: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-[10px] font-mono border-b border-slate-800/30 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className={ok === undefined ? 'text-slate-300' : ok ? 'text-emerald-400' : 'text-amber-400'}>{v}</span>
    </div>
  );
}

export function NodeConfigPanel() {
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.allSettled([
        apiGet<NodeConfig>('/api/dthink/config'),
        apiGet<NodeStatus>('/api/dthink/status'),
      ]);
      if (cfg.status === 'fulfilled') setConfig(cfg.value);
      if (st.status === 'fulfilled') setStatus(st.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load node config');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <div className="p-6 text-xs text-slate-500 font-mono animate-pulse">Loading node config...</div>;
  if (error && !config) return <div className="p-6 text-xs text-rose-400 font-mono">Error: {error}</div>;
  if (!config || !status) return <div className="p-6 text-xs text-slate-600 font-mono">No node config available. Run <span className="text-emerald-400">dthink init</span> to create one.</div>;

  const c = config.config;
  const s = status.status;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 font-mono">DThink-Node</h3>
          <div className="text-[9px] text-slate-500 font-mono">
            {config.protocol} · config: {config.config_source} · {config.config_file || 'defaults'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge ok={s.footprint.within_budget}>Footprint: {s.footprint.estimated_mb}MB / {s.footprint.target_mb}MB</Badge>
          <Badge ok={s.runtime.budget_within_limit}>Heap: {s.runtime.heap_utilization_pct}%</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identity + Memory */}
        <div className="space-y-4">
          <Section icon={Shield} title="Node Identity">
            <KV k="role" v={c.node.role} />
            <KV k="identity_key" v={c.node.identity_key} />
            <KV k="data_dir" v={c.node.data_dir} />
          </Section>

          <Section icon={MemoryStick} title="Memory (6MB Budget)">
            <KV k="max_heap_mb" v={`${c.memory.max_heap_mb} MB`} ok={c.memory.max_heap_mb <= 16} />
            <KV k="buffer_pool_kb" v={`${c.memory.buffer_pool_kb} KB`} ok={c.memory.buffer_pool_kb <= 2048} />
            <KV k="gc_interval_ms" v={`${c.memory.gc_interval_ms} ms`} />
            <KV k="est. RSS" v={`${s.runtime.estimated_rss_mb} MB`} ok={s.runtime.budget_within_limit} />
          </Section>

          <Section icon={Workflow} title="Worker">
            <KV k="max_tasks" v={`${c.worker.max_concurrent_tasks} (cap ${4})`} ok={c.worker.max_concurrent_tasks <= 4} />
            <KV k="queue_depth" v={`${c.worker.max_queue_depth} (cap ${32})`} ok={c.worker.max_queue_depth <= 32} />
            <KV k="max_payload" v={`${c.worker.max_payload_kb} KB (cap ${1024})`} ok={c.worker.max_payload_kb <= 1024} />
            <KV k="queue_ram" v={`${s.worker.queue_ram_kb} KB`} />
          </Section>
        </div>

        {/* Network + Discovery */}
        <div className="space-y-4">
          <Section icon={Network} title="Network (P2P)">
            <KV k="peers_total" v={`${c.network.max_peers_total} (cap ${32})`} ok={c.network.max_peers_total <= 32} />
            <KV k="inbound" v={String(c.network.max_inbound_peers)} />
            <KV k="outbound" v={String(status.status.network.outbound_cap)} />
            <KV k="socket_buffer" v={`${c.network.socket_buffer_kb} KB (cap ${64})`} ok={c.network.socket_buffer_kb <= 64} />
            <KV k="keepalive" v={`${c.network.keepalive_interval_sec}s`} />
            <KV k="listen" v={c.network.listen_addrs.join(', ') || '—'} />
          </Section>

          <Section icon={Database} title="Discovery & DHT">
            <KV k="dht_mode" v={c.discovery.dht_mode} ok={c.discovery.dht_mode !== 'full'} />
            <KV k="dht_ram_saving" v={`${s.network.dht_ram_saving_mb} MB`} ok={s.network.dht_ram_saving_mb > 0} />
            <KV k="mdns" v={String(c.discovery.mdns_enabled)} />
            <KV k="discovery_interval" v={`${c.discovery.discovery_interval_sec}s`} />
            <KV k="bootstrap_nodes" v={String(c.network.bootstrap_nodes?.length || 0)} />
          </Section>

          <Section icon={Cpu} title="Logging">
            <KV k="level" v={c.logging.level} />
            <KV k="format" v={c.logging.format} />
          </Section>
        </div>
      </div>

      <div className="text-[9px] text-slate-600 font-mono">
        Schema: dthink.toml · Node footprint capped at 6MB via DHT client mode, ring buffers, peer caps, bounded queue.
      </div>
    </div>
  );
}

export default NodeConfigPanel;
