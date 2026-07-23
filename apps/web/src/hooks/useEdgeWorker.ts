import { useRef, useCallback, useState } from 'react';

interface WorkerTask { task: string; payload: unknown; id: string; }

export function useEdgeWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const pending = useRef(new Map<string, { resolve: (v: unknown) => void; reject: (e: string) => void }>());

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/dataCruncher.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = (e) => {
        const { id, result, error } = e.data;
        const p = pending.current.get(id);
        if (p) {
          pending.current.delete(id);
          if (error) p.reject(error); else p.resolve(result);
        }
        const count = pending.current.size;
        setActiveCount(count);
        if (count === 0) setBusy(false);
      };
    }
    return workerRef.current;
  }, []);

  const dispatch = useCallback(async (task: string, payload: unknown): Promise<unknown> => {
    const worker = getWorker();
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      setBusy(true);
      setActiveCount(pending.current.size);
      worker.postMessage({ task, payload, id });
    });
  }, [getWorker]);

  return { dispatch, busy, activeCount };
}
