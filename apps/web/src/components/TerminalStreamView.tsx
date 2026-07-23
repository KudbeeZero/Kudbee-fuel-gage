/**
 * TerminalStreamView
 * ------------------
 * The primary terminal-style renderer for the local Ollama stream.
 *
 * Responsibilities:
 *  1. **Chunk processing.** Accepts either pre-parsed {@link StreamSegment}s
 *     (the common case, fed by `useOllamaStream`) *or* raw
 *     {@link OllamaStreamChunk}s. When raw chunks are supplied the component
 *     runs them through {@link processChunks} internally, which is where the
 *     `thinking`-field + inline `</think>`-tag parsing lives.
 *  2. **Rendering.** Walks the parsed segments and renders visible content as
 *     monospaced terminal output, while routing every `thinking` segment into
 *     a {@link ThinkingBlock} so reasoning stays collapsible.
 *  3. **Live UX.** Shows a status bar (model / status / char count), a blinking
 *     cursor while streaming, and auto-scrolls to the latest output.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { ThinkingBlock } from "./ThinkingBlock";
import { processChunks } from "../lib/streamProcessor";
import type {
  OllamaStreamChunk,
  StreamSegment,
  StreamSessionState,
  StreamStatus,
} from "../types/ollama";
import "../styles/terminal.css";

/** Props for {@link TerminalStreamView}. */
export interface TerminalStreamViewProps {
  /**
   * Pre-parsed segments to render (typically the `segments` field from
   * `useOllamaStream`). Mutually exclusive with {@link chunks}; if both are
   * supplied, `segments` takes precedence.
   */
  segments?: StreamSegment[];
  /**
   * Raw Ollama chunks to process internally (replay / static mode). Used only
   * when {@link segments} is not provided.
   */
  chunks?: OllamaStreamChunk[];
  /** Lifecycle status of the stream. */
  status?: StreamStatus;
  /** Whether the model is actively producing thinking tokens. */
  isThinking?: boolean;
  /** Model id shown in the status bar (e.g. `qwen3:8b`). */
  model?: string;
  /** Error message to surface when `status === "error"`. */
  error?: string | null;
  /** Window title shown in the terminal title bar. */
  title?: string;
  /** Auto-scroll to the bottom as new content arrives. Defaults to `true`. */
  autoScroll?: boolean;
  /** Extra class names for the root element. */
  className?: string;
  /** Aggregate session stats for the speed gauge (tokens, t/s, duration). */
  session?: StreamSessionState;
  /** Called when the user clicks "copy" in the toolbar. */
  onCopy?: (text: string) => void;
  /** Called when the user clicks "clear" in the toolbar. */
  onClear?: () => void;
  /** Tool execution state for the "Tool Executing..." badge. */
  toolState?: "idle" | "executing" | "done";
}

/**
 * Terminal-style streaming view for a local Ollama chat completion.
 *
 * @example Live mode (wired to the hook)
 * ```tsx
 * const stream = useOllamaStream({ model: "qwen3:8b" });
 * <TerminalStreamView
 *   segments={stream.segments}
 *   status={stream.status}
 *   isThinking={stream.isThinking}
 *   model="qwen3:8b"
 *   error={stream.error}
 * />
 * ```
 *
 * @example Replay mode (raw chunks processed internally)
 * ```tsx
 * <TerminalStreamView chunks={recordedChunks} status="done" model="qwen3:8b" />
 * ```
 */
export function TerminalStreamView({
  segments,
  chunks,
  status = "idle",
  isThinking = false,
  model,
  error = null,
  title = "ollama — streaming",
  autoScroll = true,
  className = "",
  session,
  onCopy,
  onClear,
  toolState,
}: TerminalStreamViewProps): ReactElement {
  // ---- Chunk-processing logic -------------------------------------------
  // When raw chunks are supplied (and no pre-parsed segments), run them
  // through the shared processor. This is the same code path the live hook
  // uses, so replay output is byte-for-byte identical to live output.
  const resolvedSegments = useMemo<StreamSegment[]>(() => {
    if (segments) return segments;
    if (chunks && chunks.length > 0) return processChunks(chunks);
    return [];
  }, [segments, chunks]);

  const visibleText = useMemo(
    () =>
      resolvedSegments
        .filter((s) => s.kind === "content")
        .map((s) => s.text)
        .join(""),
    [resolvedSegments],
  );

  // ---- Auto-scroll ------------------------------------------------------
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !autoScroll) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [resolvedSegments, autoScroll]);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    // Consider the view "pinned" to the bottom when within 24px of the end.
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  // ---- Derived display state -------------------------------------------
  const isStreaming = status === "streaming";
  const isEmpty = resolvedSegments.length === 0 && !error;

  return (
    <div
      className={`terminal-stream-view ${className}`.trim()}
      data-status={status}
      style={rootStyle}
    >
      {/* Title bar */}
      <div style={titleBarStyle}>
        <span style={dotStyle("#ff5f56")} />
        <span style={dotStyle("#ffbd2e")} />
        <span style={dotStyle("#27c93f")} />
        <span style={titleTextStyle}>{title}</span>
        {model && <span style={modelBadgeStyle}>{model}</span>}
      </div>

      {/* Status bar */}
      <div style={statusBarStyle}>
        <StatusDot status={status} />
        <span style={statusLabelStyle}>{statusLabel(status)}</span>
        {isThinking && <span style={thinkingTagStyle}>thinking</span>}
        {toolState === "executing" && (
          <span style={toolExecTagStyle}>TOOL EXECUTING…</span>
        )}
        {toolState === "done" && (
          <span style={{ ...toolExecTagStyle, color: "#27c93f", borderColor: "#1a5c2a", background: "#0a1a0a" }}>
            TOOL DONE
          </span>
        )}
        <span style={spacerStyle} />
        {session && session.evalCount > 0 && (
          <span style={counterStyle}>
            {session.evalCount} tok • {session.tokensPerSecond} t/s
          </span>
        )}
        <span style={counterStyle}>{visibleText.length} chars</span>
      </div>

      {/* CLI toolbar */}
      <div style={toolbarStyle}>
        <ToolbarButton
          label="Copy"
          title="Copy visible output"
          onClick={() => {
            onCopy?.(visibleText);
            navigator.clipboard.writeText(visibleText).catch(() => {});
          }}
        />
        {model && (
          <span style={{ ...toolbarLabelStyle, color: "#5b8cff" }}>
            {model}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {onClear && status !== "streaming" && (
          <ToolbarButton label="Clear" onClick={onClear} />
        )}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="terminal-stream-view__body"
        style={bodyStyle}
      >
        {error ? (
          <pre style={errorStyle}>{"✗ " + error}</pre>
        ) : isEmpty ? (
          <pre style={placeholderStyle}>
            {"// awaiting stream from " + (model ?? "ollama") + "…"}
          </pre>
        ) : (
          <SegmentRenderer
            segments={resolvedSegments}
            isThinking={isThinking}
          />
        )}

        {isStreaming && !isThinking && <Cursor />}
      </div>
    </div>
  );
}

export default TerminalStreamView;

/* ------------------------------------------------------------------ */
/* Internal sub-components                                            */
/* ------------------------------------------------------------------ */

/**
 * Renders the parsed segment list, routing thinking segments to
 * {@link ThinkingBlock} and content segments to terminal text.
 */
function SegmentRenderer({
  segments,
  isThinking,
}: {
  segments: StreamSegment[];
  isThinking: boolean;
}): ReactElement {
  return (
    <>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        if (segment.kind === "thinking") {
          return (
            <ThinkingBlock
              key={`think-${index}`}
              thinking={segment.text}
              // Only the trailing thinking segment is "live".
              isThinking={isLast && isThinking}
              autoCollapseOnDone={false}
              brandedPhases
            />
          );
        }
        return (
          <pre key={`content-${index}`} style={contentTextStyle}>
            {segment.text}
          </pre>
        );
      })}
    </>
  );
}

/** Blinking block cursor shown while the model streams visible content. */
function Cursor(): ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 15,
        marginLeft: 2,
        background: "#5b8cff",
        verticalAlign: "text-bottom",
        animation: "terminal-cursor-blink 1s step-end infinite",
      }}
    />
  );
}

/** Colored status dot for the status bar. */
function StatusDot({ status }: { status: StreamStatus }): ReactElement {
  const color =
    status === "streaming"
      ? "#27c93f"
      : status === "error"
        ? "#ff5f56"
        : status === "done"
          ? "#5b8cff"
          : "#6a6a78";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        ...(status === "streaming"
          ? { animation: "thinking-pulse 1s ease-in-out infinite" }
          : {}),
      }}
    />
  );
}

/** Human-readable label for a stream status. */
function statusLabel(status: StreamStatus): string {
  switch (status) {
    case "idle":
      return "idle";
    case "streaming":
      return "streaming";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return String(status);
  }
}

/** Small toolbar button (Copy / Clear). */
function ToolbarButton({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}): ReactElement {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      style={tbBtnStyle}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 240,
  background: "#0a0a0f",
  border: "1px solid #1f1f2a",
  borderRadius: 8,
  overflow: "hidden",
  fontFamily:
    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#d6d6e0",
};

const titleBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  background: "#12121a",
  borderBottom: "1px solid #1f1f2a",
};

const dotStyle = (color: string): CSSProperties => ({
  display: "inline-block",
  width: 11,
  height: 11,
  borderRadius: "50%",
  background: color,
});

const titleTextStyle: CSSProperties = {
  marginLeft: 8,
  color: "#7c7c8a",
  fontSize: 12,
  letterSpacing: 0.3,
};

const modelBadgeStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "1px 8px",
  borderRadius: 4,
  background: "#1a1a26",
  color: "#9a9ab0",
  fontSize: 11,
};

const statusBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 12px",
  background: "#0d0d14",
  borderBottom: "1px solid #1f1f2a",
  fontSize: 11,
  color: "#6a6a78",
};

const statusLabelStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const spacerStyle: CSSProperties = {
  flex: 1,
};

const counterStyle: CSSProperties = {
  color: "#5c5c6a",
};

const thinkingTagStyle: CSSProperties = {
  padding: "0 6px",
  borderRadius: 3,
  background: "#1a1a26",
  color: "#5b8cff",
};

const toolExecTagStyle: CSSProperties = {
  padding: "0 6px",
  borderRadius: 3,
  background: "#2a1a0a",
  border: "1px solid #5c3a1a",
  color: "#ff9c3e",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  animation: "kudbee-phase-pulse 0.8s ease-in-out infinite",
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 14px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const contentTextStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const placeholderStyle: CSSProperties = {
  margin: 0,
  color: "#4a4a58",
  fontStyle: "italic",
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: "#ff6b6b",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

/* ---- CLI toolbar styles ---- */

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  background: "#0a0a12",
  borderBottom: "1px solid #1f1f2a",
  fontSize: 10,
};

const toolbarLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
};

const tbBtnStyle: CSSProperties = {
  padding: "2px 10px",
  background: "#12121a",
  color: "#7c7c8a",
  border: "1px solid #1f1f2a",
  borderRadius: 4,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  cursor: "pointer",
};
