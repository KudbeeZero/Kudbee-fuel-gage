/**
 * useToolInterceptor
 * ------------------
 * Parses tool_calls embedded in Ollama's streaming response, executes
 * the corresponding tool via the {@link toolRegistry}, and feeds the
 * result back to the model for continuous reasoning.
 *
 * Qwen3:8b (and other tool-capable models) emit JSON blocks within
 * the content stream like:
 *
 *   {"tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {"path": "src/App.tsx"}}]}
 *
 * This hook intercepts those blocks, pauses the stream, runs the tool,
 * and returns a function to submit the result as the next user message.
 */

import { useCallback, useRef, useState } from "react";
import { toolRegistry } from "../tools/registry";
import type { ToolCall, ToolResult } from "../tools/registry";
import type { OllamaMessage } from "../types/ollama";

export type ToolState = "idle" | "executing" | "done";

export interface ToolExecEvent {
  call: ToolCall;
  result: ToolResult;
  timestamp: number;
}

export interface UseToolInterceptorResult {
  /** Current tool-execution state (shown as badge in the UI). */
  toolState: ToolState;
  /** The last tool execution event for rendering feedback. */
  lastEvent: ToolExecEvent | null;
  /**
   * Scan a chunk of assistant content for embedded `tool_calls` JSON.
   * If found, executes the tool(s) and returns `true` + sets toolState.
   * The caller should pause the stream until `submitToolResults` is called.
   */
  intercept: (content: string) => Promise<ToolExecEvent[]>;
  /** Build a user message from tool results to feed back to the model. */
  buildToolResultMessages: (events: ToolExecEvent[]) => OllamaMessage[];
  /** Reset tool state for a new turn. */
  reset: () => void;
}

const TOOL_CALL_RE = /\{[^{}]*"tool_calls"\s*:\s*\[([^\]]*)\][^{}]*\}/g;

function extractToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of text.matchAll(TOOL_CALL_RE)) {
    try {
      const parsed = JSON.parse(match[0]) as {
        tool_calls: Array<{
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        }>;
      };
      for (const tc of parsed.tool_calls ?? []) {
        calls.push({
          id: tc.id ?? `call_${calls.length}`,
          tool: tc.name ?? "unknown",
          params: tc.arguments ?? {},
        });
      }
    } catch {
      /* Malformed JSON — skip. */
    }
  }
  return calls;
}

export function useToolInterceptor(): UseToolInterceptorResult {
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [lastEvent, setLastEvent] = useState<ToolExecEvent | null>(null);
  const executedRef = useRef<Set<string>>(new Set());

  const intercept = useCallback(async (content: string): Promise<ToolExecEvent[]> => {
    const calls = extractToolCalls(content);
    if (calls.length === 0) return [];

    const newCalls = calls.filter((c) => !executedRef.current.has(c.id));
    if (newCalls.length === 0) return [];

    setToolState("executing");
    const events: ToolExecEvent[] = [];
    for (const call of newCalls) {
      executedRef.current.add(call.id);
      const result = await toolRegistry.execute(call);
      const event: ToolExecEvent = { call, result, timestamp: Date.now() };
      events.push(event);
      setLastEvent(event);
    }
    setToolState("done");
    return events;
  }, []);

  const buildToolResultMessages = useCallback(
    (events: ToolExecEvent[]): OllamaMessage[] =>
      events.map((e) => ({
        role: "user" as const,
        content: `[tool result: ${e.call.tool}]\n${e.result.success ? "SUCCESS" : "FAILED"}\n${e.result.output}${e.result.error ? `\nError: ${e.result.error}` : ""}`,
      })),
    [],
  );

  const reset = useCallback(() => {
    setToolState("idle");
    setLastEvent(null);
    executedRef.current = new Set();
  }, []);

  return { toolState, lastEvent, intercept, buildToolResultMessages, reset };
}
