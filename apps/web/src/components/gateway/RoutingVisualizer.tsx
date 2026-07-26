import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart } from 'lucide-react';
import { GatewayLog } from '../../hooks/useRoutingRules';
import { useTopologyEvents } from '../../hooks/useTopologyEvents';
import { useControlTowerStore, type GroqRouteMetric } from '../../store/useControlTowerStore';
import { NODE_POSITIONS, EDGES, type TopologyNode } from './topologyNodes';

interface RoutingVisualizerProps {
  activeRoute: 'IDLE' | 'PRIMARY' | 'FAILOVER';
  gatewayLogs: GatewayLog[];
  onTestRoute: () => void;
}

interface Packet {
  id: number;
  from: number;
  to: number;
  progress: number;
  opacity: number;
  color: string;
}

let _packetId = 0;

function statusColor(status: string): string {
  if (status === 'online') return 'emerald';
  if (status === 'degraded') return 'amber';
  return 'rose';
}

function nodeGlowColor(status: string): string {
  if (status === 'online') return 'rgba(52,211,153,0.4)';
  if (status === 'degraded') return 'rgba(251,191,36,0.4)';
  return 'rgba(244,63,94,0.4)';
}

function LatencyHistogram({ metrics }: { metrics: GroqRouteMetric[] }) {
  if (metrics.length === 0) return null;

  const bins = [50, 100, 200, 500, 1000, 2000, 5000];
  const histogram = bins.map((threshold, idx) => {
    const prev = idx === 0 ? 0 : bins[idx - 1];
    const count = metrics.filter((m) => m.latencyMs >= prev && m.latencyMs < threshold).length;
    return { label: prev === 0 ? `<${threshold}ms` : `${prev}-${threshold}ms`, count, threshold };
  });
  const over = metrics.filter((m) => m.latencyMs >= 5000).length;
  if (over > 0) histogram.push({ label: '≥5000ms', count: over, threshold: 9999 });
  const maxCount = Math.max(...histogram.map((h) => h.count), 1);

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">GROQ Latency Histogram</span>
        <span className="ml-auto text-[9px] font-mono text-slate-500">{metrics.length} samples</span>
      </div>
      <div className="grid grid-cols-7 gap-1 items-end" style={{ height: 80 }}>
        {histogram.map((h) => (
          <div key={h.label} className="flex flex-col items-center justify-end h-full">
            <span className="text-[7px] font-mono text-slate-500 mb-0.5">{h.count}</span>
            <div
              className="w-full min-w-[24px] rounded-t"
              style={{
                height: `${Math.max(4, (h.count / maxCount) * 100)}%`,
                backgroundColor: h.count === 0 ? 'transparent' : h.threshold < 200 ? '#34d399' : h.threshold < 500 ? '#fbbf24' : '#f43f5e',
                opacity: h.count === 0 ? 0 : 0.8
              }}
            />
            <span className="text-[6px] font-mono text-slate-600 mt-1 leading-tight text-center">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderHealthBanner({ metrics }: { metrics: GroqRouteMetric[] }) {
  if (metrics.length === 0) return null;

  const total = metrics.length;
  const ok = metrics.filter((m) => m.status === 'OK').length;
  const errors = metrics.filter((m) => m.status === 'ERROR').length;
  const timeouts = metrics.filter((m) => m.status === 'TIMEOUT').length;
  const healthPct = Math.round((ok / total) * 100);

  const avgLatency = Math.round(metrics.reduce((s, m) => s + m.latencyMs, 0) / total);
  const totalTokens = metrics.reduce((s, m) => s + m.tokensIn + m.tokensOut, 0);
  const totalCost = metrics.reduce((s, m) => s + m.cost, 0);

  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
      <div className="rounded-lg bg-slate-800/30 p-2">
        <div className="text-[8px] font-mono text-slate-500 uppercase">Health</div>
        <div className={`font-mono text-sm font-bold ${healthPct >= 90 ? 'text-emerald-400' : healthPct >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{healthPct}%</div>
      </div>
      <div className="rounded-lg bg-slate-800/30 p-2">
        <div className="text-[8px] font-mono text-slate-500 uppercase">Avg Lat</div>
        <div className="font-mono text-sm font-bold text-slate-300">{avgLatency}ms</div>
      </div>
      <div className="rounded-lg bg-slate-800/30 p-2">
        <div className="text-[8px] font-mono text-slate-500 uppercase">Tokens</div>
        <div className="font-mono text-sm font-bold text-slate-300">{totalTokens.toLocaleString()}</div>
      </div>
      <div className="rounded-lg bg-slate-800/30 p-2">
        <div className="text-[8px] font-mono text-slate-500 uppercase">Cost</div>
        <div className="font-mono text-sm font-bold text-slate-300">${totalCost.toFixed(4)}</div>
      </div>
    </div>
  );
}

export function RoutingVisualizer({ activeRoute, gatewayLogs, onTestRoute }: RoutingVisualizerProps) {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({
    hermes: 'online', sentinel: 'online', crucible: 'online'
  });
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const groqMetrics = useControlTowerStore((s) => s.groqMetrics);

  const spawnPacket = useCallback((from: number, to: number, color: string) => {
    setPackets((prev) => [...prev.slice(-40), {
      id: ++_packetId,
      from,
      to,
      progress: 0,
      opacity: 0.8,
      color
    }]);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const edgeCount = EDGES.length;
      const idx = Math.floor(Math.random() * edgeCount);
      const [from, to, color] = EDGES[idx];
      spawnPacket(from, to, color);
    }, 600);
    return () => clearInterval(interval);
  }, [spawnPacket]);

  useTopologyEvents({
    onPacket: useCallback((p) => {
      spawnPacket(p.from, p.to, p.color);
    }, [spawnPacket])
  });

  useEffect(() => {
    const agentInterval = setInterval(() => {
      setAgentStatuses((prev) => {
        const r = Math.random();
        if (r < 0.85) return prev;
        const agents = ['hermes', 'sentinel', 'crucible'];
        const agent = agents[Math.floor(Math.random() * agents.length)];
        const statuses = ['online', 'online', 'online', 'online', 'degraded', 'offline'];
        return { ...prev, [agent]: statuses[Math.floor(Math.random() * statuses.length)] };
      });
    }, 5000);
    return () => clearInterval(agentInterval);
  }, []);

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;

      setPackets((prev) => prev
        .map((p) => ({
          ...p,
          progress: p.progress + delta * 0.0005,
          opacity: Math.max(0, p.opacity - delta * 0.0002)
        }))
        .filter((p) => p.progress < 1 && p.opacity > 0)
      );

      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  const nodes = NODE_POSITIONS.map((n) => {
    const s = n.agentId ? (agentStatuses[n.agentId] || 'online') : n.status;
    return { ...n, status: s as 'online' | 'degraded' | 'offline' };
  });

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">BraiNCA Live Topology</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Real-time agent routing graph with animated packet flow</p>
          </div>
          <button
            onClick={onTestRoute}
            className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold tracking-wider rounded-lg hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer"
          >
            TEST ROUTE
          </button>
        </div>

        <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden" style={{ height: 420 }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {EDGES.map(([from, to, color], i) => (
              <line
                key={i}
                x1={nodes[from].x}
                y1={nodes[from].y}
                x2={nodes[to].x}
                y2={nodes[to].y}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.3}
                strokeDasharray="6 4"
              />
            ))}
            {packets.map((p) => {
              const from = nodes[p.from];
              const to = nodes[p.to];
              const cx = lerp(from.x, to.x, p.progress);
              const cy = lerp(from.y, to.y, Math.pow(p.progress, 0.7));
              return (
                <circle
                  key={p.id}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={p.color}
                  opacity={p.opacity}
                  filter="url(#packet-glow)"
                />
              );
            })}
            <defs>
              <filter id="packet-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>

          {nodes.map((node, idx) => {
            const Icon = node.icon;
            const col = statusColor(node.status);
            return (
              <div
                key={idx}
                className="absolute z-10 flex flex-col items-center transition-all duration-500"
                style={{
                  left: node.x - 36,
                  top: node.y - 36,
                }}
              >
                <div
                  className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center bg-slate-900 transition-all duration-500`}
                  style={{
                    borderColor: col === 'emerald' ? 'rgb(52,211,153)' : col === 'amber' ? 'rgb(251,191,36)' : 'rgb(244,63,94)',
                    boxShadow: `0 0 16px ${nodeGlowColor(node.status)}`,
                  }}
                >
                  <Icon className={`w-5 h-5 ${col === 'emerald' ? 'text-emerald-400' : col === 'amber' ? 'text-amber-400' : 'text-rose-400'}`} />
                </div>
                <span className="font-mono text-[9px] text-slate-300 mt-1.5 font-semibold tracking-wider text-center">
                  {node.label}
                </span>
                <span className={`font-mono text-[7px] uppercase tracking-widest mt-0.5 ${
                  node.status === 'online' ? 'text-emerald-400' :
                  node.status === 'degraded' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {node.status}
                </span>
              </div>
            );
          })}
        </div>

        <ProviderHealthBanner metrics={groqMetrics} />
        <LatencyHistogram metrics={groqMetrics} />

        <div className="mt-4 bg-black rounded-lg border border-slate-800 p-4 h-40 overflow-y-auto">
          <h4 className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mb-3 border-b border-slate-800 pb-2">Packet Log</h4>
          <div className="space-y-1.5">
            {gatewayLogs.map(log => (
              <div key={log.id} className="font-mono text-xs flex items-start gap-3">
                <span className="text-slate-600 whitespace-nowrap">
                  [{log.timestamp.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}]
                </span>
                <span className={`font-semibold whitespace-nowrap ${
                  log.level === 'INFO' ? 'text-blue-400' :
                  log.level === 'WARN' ? 'text-amber-400' :
                  log.level === 'ERROR' ? 'text-red-400' :
                  'text-emerald-400'
                }`}>
                  [{log.level}]
                </span>
                <span className="text-slate-300">
                  {log.message}
                </span>
              </div>
            ))}
            {gatewayLogs.length === 0 && (
              <div className="text-slate-600 text-xs font-mono italic">Awaiting packets...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoutingVisualizer;
