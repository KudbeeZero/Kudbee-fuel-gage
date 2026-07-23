import { createContext, useContext, type ReactNode } from 'react';
import { useOsStream } from '../hooks/useOsStream';

interface OsSnapshot {
  ts: string;
  uptime: number;
  services: {
    postgres: { ok: boolean; latencyMs: number | null };
    redis: { ok: boolean; latencyMs: number | null };
  };
  governance: { pending: number };
  think: { tokens: number; verified: number };
  memory: { vectors: number; chunks: number };
  alerts: number;
}

interface OsStreamContextValue {
  snapshot: OsSnapshot;
  connected: boolean;
  error: string | null;
}

const OsStreamContext = createContext<OsStreamContextValue | null>(null);

export function OsStreamProvider({ children }: { children: ReactNode }) {
  const { snapshot, connected, error } = useOsStream();
  return <OsStreamContext.Provider value={{ snapshot, connected, error }}>{children}</OsStreamContext.Provider>;
}

export function useOsSnapshot(): OsStreamContextValue {
  const ctx = useContext(OsStreamContext);
  if (!ctx) {
    return {
      snapshot: {
        ts: '',
        uptime: 0,
        services: { postgres: { ok: false, latencyMs: null }, redis: { ok: false, latencyMs: null } },
        governance: { pending: 0 },
        think: { tokens: 0, verified: 0 },
        memory: { vectors: 0, chunks: 0 },
        alerts: 0
      },
      connected: false,
      error: null
    };
  }
  return ctx;
}

export { type OsSnapshot };
