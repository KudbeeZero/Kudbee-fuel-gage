import { useCallback, useRef, useState } from 'react';
import { apiPost } from '../lib/apiClient';
import { useCommandDispatcher } from '../store/commandDispatcher';

export interface PlaygroundMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PlaygroundResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latencyMs: number;
  route: 'FAST_BRAIN' | 'SLOW_BRAIN';
  matched: boolean;
  traceId?: string;
}

export interface PlaygroundRunInput {
  prompt: string;
  model: string;
  provider: string;
}

interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  governance?: {
    route?: 'FAST_BRAIN' | 'SLOW_BRAIN';
    matched?: boolean;
    confidence?: number;
  };
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

const RATES: Record<string, { in: number; out: number }> = {
  anthropic: { in: 0.003, out: 0.015 },
  openai: { in: 0.005, out: 0.015 },
  google: { in: 0.00125, out: 0.005 },
  deepseek: { in: 0.00055, out: 0.00219 }
};

function calculateCost(provider: string, tokensIn: number, tokensOut: number): number {
  const rate = RATES[provider.toLowerCase()] || RATES.anthropic!;
  return (tokensIn / 1000) * rate.in + (tokensOut / 1000) * rate.out;
}

export function usePlaygroundBackend() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const cancel = useCallback(() => {
    cancelRef.current.cancelled = true;
    setIsRunning(false);
  }, []);

  const run = useCallback(
    async (input: PlaygroundRunInput): Promise<PlaygroundResult | null> => {
      setError(null);
      if (!input.prompt.trim()) {
        const msg = 'Prompt payload is empty — refusing to dispatch to backend.';
        setError(msg);
        return null;
      }

      setIsRunning(true);
      const handle = { cancelled: false };
      cancelRef.current = handle;
      const start = performance.now();
      const { enqueue, setState } = useCommandDispatcher.getState();
      const cmdId = enqueue({
        kind: 'PLAYGROUND_RUN',
        label: 'Playground Completion',
        description: `${input.model} — ${input.prompt.slice(0, 60)}${input.prompt.length > 60 ? '…' : ''}`
      });
      setState(cmdId, 'PROCESSING', 'Dispatching to /v1/chat/completions…');

      try {
        const res = await apiPost<ChatCompletionResponse>('/v1/chat/completions', {
          model: input.model,
          messages: [{ role: 'user', content: input.prompt }]
        });
        if (handle.cancelled) {
          setState(cmdId, 'FAILED', 'cancelled by operator');
          return null;
        }
        const content =
          res.choices?.[0]?.message?.content?.trim() ||
          'No content returned from backend.';
        const tokensIn = estimateTokens(input.prompt);
        const tokensOut = estimateTokens(content);
        const cost = calculateCost(input.provider, tokensIn, tokensOut);
        const latencyMs = Math.round(performance.now() - start);
        const traceId = `pg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

        // Best-effort telemetry persistence. Ingestion may be firewall-filtered
        // (low-value/heartbeat) without causing a hard error in the playground.
        apiPost('/api/telemetry/ingest', {
          trace_id: traceId,
          model: input.model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost,
          status: 'OK',
          provider: input.provider,
          project_name: 'kilo-fuel-gauge',
          thought_summary: content.slice(0, 200),
          reasoning: input.prompt.slice(0, 200)
        }).catch(() => {
          /* ingestion is best-effort; playground already records to console */
        });

        setState(
          cmdId,
          'SUCCESS',
          `${res.governance?.route ?? 'SLOW_BRAIN'} · ${latencyMs}ms · ${tokensIn}+${tokensOut}t`
        );
        return {
          content,
          model: res.model || input.model,
          tokensIn,
          tokensOut,
          cost,
          latencyMs,
          route: res.governance?.route ?? 'SLOW_BRAIN',
          matched: !!res.governance?.matched,
          traceId
        };
      } catch (err) {
        if (handle.cancelled) {
          setState(cmdId, 'FAILED', 'cancelled by operator');
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setState(cmdId, 'FAILED', message);
        }
        return null;
      } finally {
        if (cancelRef.current === handle) {
          setIsRunning(false);
        }
      }
    },
    []
  );

  return { isRunning, error, run, cancel };
}
