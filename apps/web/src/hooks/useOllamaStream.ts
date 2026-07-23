/**
 * React hook for streaming a chat completion from the local Ollama instance.
 *
 * The hook owns a {@link StreamChunkProcessor} and exposes the parsed
 * {@link StreamSegment}s plus the live stream status so components can render
 * incrementally as tokens arrive.
 *
 * @remarks
 * Supports {@link ChatRequestOptions} for tuning temperature, context window
 * size (`numCtx`), top-p sampling, and max-token limits.  System prompts are
 * injected as the first message in the conversation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { StreamChunkProcessor } from "../lib/streamProcessor";
import { getProxyBase } from "../lib/proxyBase";
import type {
  ChatRequestOptions,
  OllamaMessage,
  OllamaStreamChunk,
  StreamSegment,
  StreamSessionState,
  StreamStatus,
} from "../types/ollama";

/** Configuration for {@link useOllamaStream}. */
export interface UseOllamaStreamOptions {
  /** Base URL of the local Ollama server. Defaults to `/ollama` (Vite proxy). */
  readonly baseUrl?: string;
  /** Model id to chat with, e.g. `qwen3:8b`. */
  readonly model: string;
  /** Abort the in-flight stream when this flag flips to `false`. */
  readonly enabled?: boolean;
}

/** The public surface returned by {@link useOllamaStream}. */
export interface UseOllamaStreamResult {
  /** Parsed segments produced so far (content + thinking). */
  segments: StreamSegment[];
  /** Concatenated visible content for convenience. */
  visibleText: string;
  /** Concatenated thinking content for convenience. */
  thinkingText: string;
  /** Whether the processor is currently inside a thinking block. */
  isThinking: boolean;
  /** Current lifecycle status of the stream. */
  status: StreamStatus;
  /** Error message if the stream failed. */
  error: string | null;
  /** Aggregate session stats (tokens, duration, tokens/sec). */
  session: StreamSessionState;
  /**
   * Kick off a new streaming chat completion.
   *
   * @param messages  Conversation history (roles: `user` | `assistant`).
   * @param opts      Optional tuning knobs forwarded to Ollama.
   */
  send: (messages: OllamaMessage[], opts?: ChatRequestOptions) => Promise<void>;
  /** Abort the active stream and reset state. */
  stop: () => void;
}

// Relative path so fetch requests route through Studio proxy (cloudspaces)
// when present, while still resolving correctly on localhost.
const DEFAULT_BASE_URL = "ollama";

const EMPTY_SESSION: StreamSessionState = {
  evalCount: 0,
  promptEvalCount: 0,
  totalDuration: 0,
  loadDuration: 0,
  tokensPerSecond: 0,
};

/**
 * Stream a chat completion from a local Ollama server.
 *
 * @example
 * ```tsx
 * const { segments, status, session, send, stop } = useOllamaStream({
 *   model: "qwen3:8b",
 * });
 * await send(messages, { temperature: 0.7, numCtx: 4096 });
 * ```
 */
export function useOllamaStream(
  options: UseOllamaStreamOptions,
): UseOllamaStreamResult {
  const { baseUrl = DEFAULT_BASE_URL, model, enabled = true } = options;

  const processorRef = useRef<StreamChunkProcessor>(new StreamChunkProcessor());
  const abortRef = useRef<AbortController | null>(null);

  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StreamSessionState>(EMPTY_SESSION);

  const processor = processorRef.current;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((prev) => (prev === "streaming" ? "done" : prev));
  }, []);

  const send = useCallback(
    async (messages: OllamaMessage[], opts?: ChatRequestOptions) => {
      processor.reset();
      setSegments([]);
      setError(null);
      setSession(EMPTY_SESSION);
      setStatus("streaming");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          model,
          messages: opts?.system
            ? [{ role: "system", content: opts.system }, ...messages]
            : messages,
          stream: true,
        };

        const ollamaOpts: Record<string, unknown> = {};
        if (opts?.temperature !== undefined) ollamaOpts.temperature = opts.temperature;
        if (opts?.numCtx !== undefined) ollamaOpts.num_ctx = opts.numCtx;
        if (opts?.topP !== undefined) ollamaOpts.top_p = opts.topP;
        if (opts?.numPredict !== undefined) ollamaOpts.num_predict = opts.numPredict;
        if (Object.keys(ollamaOpts).length > 0) body.options = ollamaOpts;

        const response = await fetch(`${getProxyBase()}${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
          let detail = "";
          try {
            const errorBody = await response.text();
            detail = JSON.parse(errorBody).error ?? errorBody;
          } catch {
            detail = response.statusText;
          }
          throw new Error(`Ollama responded with ${response.status}: ${detail}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let partial = "";
        let finalChunk: OllamaStreamChunk | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          partial += decoder.decode(value, { stream: true });
          const lines = partial.split("\n");
          partial = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            try {
              const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
              processor.push(chunk);
              setSegments(processor.allSegments());
              if (chunk.done) finalChunk = chunk;
            } catch {
              console.debug(
                "[useOllamaStream] skipping malformed line:",
                trimmed.slice(0, 80),
              );
            }
          }
        }

        processor.flush();
        setSegments(processor.allSegments());

        if (finalChunk) {
          const evalCount = finalChunk.eval_count ?? 0;
          const totalDuration = finalChunk.total_duration ?? 0;
          const tokensPerSecond =
            totalDuration > 0
              ? Math.round((evalCount / (totalDuration / 1e9)) * 10) / 10
              : 0;
          setSession({
            evalCount,
            promptEvalCount: finalChunk.prompt_eval_count ?? 0,
            totalDuration,
            loadDuration: finalChunk.load_duration ?? 0,
            tokensPerSecond,
          });
        }

        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("done");
          return;
        }
        setError((err as Error).message);
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [baseUrl, model, processor],
  );

  useEffect(() => {
    if (!enabled) stop();
    return () => abortRef.current?.abort();
  }, [enabled, stop]);

  return {
    segments,
    visibleText: processor.visibleText(),
    thinkingText: processor.thinkingText(),
    isThinking: processor.isThinking(),
    status,
    error,
    session,
    send,
    stop,
  };
}
