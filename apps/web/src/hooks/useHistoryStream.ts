import { useState, useCallback } from 'react';
import { useTelemetryStream } from './useTelemetryStream';

export function useHistoryStream() {
  const { mode, throughput, error, reconnect } = useTelemetryStream();
  const [paused, setPaused] = useState(false);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  return {
    mode,
    throughput,
    error,
    paused,
    togglePause,
    reconnect,
    isActive: !paused && mode !== 'DISCONNECTED'
  };
}
