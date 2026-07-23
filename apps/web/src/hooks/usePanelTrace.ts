import { useEffect, useRef } from 'react';

export function usePanelTrace(name: string) {
  const start = useRef(Date.now());
  useEffect(() => {
    const mountMs = Date.now() - start.current;
    console.log(`[UI:Trace] ${name} mounted in ${mountMs}ms`);
    return () => { /* unmount */ };
  }, [name]);
}

export function traceFetch(name: string, startMs: number) {
  const latency = Date.now() - startMs;
  console.log(`[UI:Trace] ${name} fetch: ${latency}ms`);
  return latency;
}
