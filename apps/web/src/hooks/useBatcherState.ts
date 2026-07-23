import { useEffect, useState } from 'react';
import { subscribeBatcher, getBatcherState, type BatcherState } from '../lib/telemetryBatcher';

export function useBatcherState(): BatcherState {
  const [state, setState] = useState<BatcherState>(getBatcherState);

  useEffect(() => {
    return subscribeBatcher((next) => {
      setState(next);
    });
  }, []);

  return state;
}
