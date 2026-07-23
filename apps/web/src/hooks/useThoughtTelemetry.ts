/**
 * useThoughtTelemetry
 * -------------------
 * Captures parsed `<think>` blocks and session stats from the Ollama
 * stream and POSTs them to `/api/telemetry/thoughts` for storage in
 * a local NDJSON dataset.
 *
 * This is the foundational "thought token pipeline" for future model
 * training — every reasoning trace gets harvested automatically.
 */

import { useCallback, useRef } from "react";
import type { StreamSegment, StreamSessionState } from "../types/ollama";

export interface ThoughtPayload {
  model: string;
  thinkingText: string;
  visibleText: string;
  segments: StreamSegment[];
  session: StreamSessionState;
  timestamp: string;
}

export function useThoughtTelemetry(model: string) {
  const postedRef = useRef<Set<string>>(new Set());

  const postTelemetry = useCallback(
    async (segments: StreamSegment[], session: StreamSessionState) => {
      const thinkingText = segments
        .filter((s) => s.kind === "thinking")
        .map((s) => s.text)
        .join("");
      if (!thinkingText) return;

      // Deduplicate by thinking content digest.
      const digest = thinkingText.slice(0, 120);
      if (postedRef.current.has(digest)) return;
      postedRef.current.add(digest);

      const payload: ThoughtPayload = {
        model,
        thinkingText,
        visibleText: segments
          .filter((s) => s.kind === "content")
          .map((s) => s.text)
          .join(""),
        segments,
        session,
        timestamp: new Date().toISOString(),
      };

      try {
        await fetch("/api/telemetry/thoughts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Fire-and-forget; quietly ignore network errors.
      }
    },
    [model],
  );

  const reset = useCallback(() => {
    postedRef.current = new Set();
  }, []);

  return { postTelemetry, reset };
}
