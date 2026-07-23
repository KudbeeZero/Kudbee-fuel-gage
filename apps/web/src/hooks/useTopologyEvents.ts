import { useEffect } from 'react';
import { useEventStream } from '../hooks/useEventStream';

interface TopologyPacket {
  from: number;
  to: number;
  color: string;
  ts: number;
}

interface UseTopologyEventsOptions {
  onPacket: (packet: TopologyPacket) => void;
}

export function useTopologyEvents({ onPacket }: UseTopologyEventsOptions) {
  const { on } = useEventStream();

  useEffect(() => {
    const unsub1 = on('governance', () => onPacket({ from: 2, to: 1, color: '#8b5cf6', ts: Date.now() }));
    const unsub2 = on('telemetry', () => onPacket({ from: 0, to: 2, color: '#3b82f6', ts: Date.now() }));
    const unsub3 = on('hermes_suggestion', () => onPacket({ from: 1, to: 4, color: '#f59e0b', ts: Date.now() }));
    const unsub4 = on('triage', () => onPacket({ from: 2, to: 3, color: '#06b6d4', ts: Date.now() }));
    const unsub5 = on('slow_brain', () => onPacket({ from: 4, to: 6, color: '#ec4899', ts: Date.now() }));
    const unsub6 = on('hermes', () => onPacket({ from: 1, to: 6, color: '#14b8a6', ts: Date.now() }));

    return () => {
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6();
    };
  }, [on, onPacket]);
}
