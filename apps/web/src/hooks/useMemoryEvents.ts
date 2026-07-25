import { useEffect } from 'react';
import { useEventStream } from './useEventStream';
import { useControlTowerStore } from '../store/useControlTowerStore';

export function useMemoryEvents() {
  const { on } = useEventStream();
  const pushMemoryStored = useControlTowerStore((s) => s.pushMemoryStored);
  const incrementMemoryRecall = useControlTowerStore((s) => s.incrementMemoryRecall);
  const setRecallWindowSize = useControlTowerStore((s) => s.setRecallWindowSize);

  useEffect(() => {
    const unsubStore = on('memory.stored', (data: any) => {
      pushMemoryStored({
        id: data.chunkId || `mem-${Date.now()}`,
        content: data.content || data.summary || 'Unknown memory',
        category: data.category || 'FACT',
        importance: data.importance ?? 0.7
      });
    });

    const unsubIngest = on('memory.ingested', (data: any) => {
      pushMemoryStored({
        id: data.trace_id || `ing-${Date.now()}`,
        content: data.content || `Telemetry trace ingested`,
        category: data.category || 'OBSERVATION',
        importance: data.importance ?? 0.5
      });
    });

    const unsubRecall = on('memory.recalled', (data: any) => {
      incrementMemoryRecall();
      if (data.importance != null) {
        setRecallWindowSize(1);
      }
    });

    return () => {
      unsubStore();
      unsubIngest();
      unsubRecall();
    };
  }, [on, pushMemoryStored, incrementMemoryRecall, setRecallWindowSize]);
}
