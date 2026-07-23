/**
 * ThinkingBlock
 * -------------
 * A collapsible terminal-style panel that renders the "thinking" / reasoning
 * content intercepted from the local Ollama stream.
 *
 * The raw model output wraps reasoning in `</think>` tags. The
 * {@link StreamChunkProcessor} (see `lib/streamProcessor.ts`) strips those
 * tags and emits `kind: "thinking"` segments; this component is responsible
 * for *displaying* them with a collapsible, toggleable UI.
 *
 * Behaviour:
 *  - While `isThinking` is `true` the block auto-expands and shows a live
 *    "Thinking…" indicator.
 *  - Once thinking finishes the user can collapse/expand it freely via the
 *    toggle button. The block remembers the user's choice.
 *  - The component can be used uncontrolled (manages its own open state) or
 *    controlled (via `open` / `onOpenChange`).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactElement } from "react";
import type { StreamSegment, ThinkingPhase } from "../types/ollama";
import "../styles/terminal.css";

/** Props for {@link ThinkingBlock}. */
export interface ThinkingBlockProps {
  /**
   * The thinking text to render. Either pass this convenience string *or*
   * pass {@link segments}; if both are supplied, `segments` wins.
   */
  thinking?: string;
  /** Pre-parsed thinking segments (preferred when available). */
  segments?: StreamSegment[];
  /** Whether the model is actively producing thinking tokens right now. */
  isThinking?: boolean;
  /** Optional label shown in the header. Defaults to "Thinking". */
  label?: string;
  /** Controlled open state. Leave undefined for uncontrolled usage. */
  open?: boolean;
  /** Called when the user toggles the block (controlled mode). */
  onOpenChange?: (open: boolean) => void;
  /** Auto-collapse once thinking finishes. Defaults to `false`. */
  autoCollapseOnDone?: boolean;
  /** Extra class names for the root element. */
  className?: string;
  /**
   * Use KUDBEE-branded cycling phase labels instead of a static label.
   * When enabled + `isThinking`, the header cycles through:
   * "KUDBEE thinking…" → "KUDBEE wondering…" → "KUDBEE reasoning…" …
   */
  brandedPhases?: boolean;
}

/**
 * Collapsible panel that displays intercepted `thinking` content from the
 * Ollama stream.
 *
 * @example
 * ```tsx
 * <ThinkingBlock
 *   segments={thinkingSegments}
 *   isThinking={stream.isThinking}
 * />
 * ```
 */
/** Sequence of KUDBEE-branded phase labels when `brandedPhases` is on. */
const BRANDED_PHASES: ThinkingPhase[] = [
  "KUDBEE thinking…",
  "KUDBEE wondering…",
  "KUDBEE reasoning…",
  "KUDBEE analyzing…",
  "KUDBEE verifying…",
  "KUDBEE reflecting…",
];

export function ThinkingBlock({
  thinking = "",
  segments,
  isThinking = false,
  label = "Thinking",
  open,
  onOpenChange,
  autoCollapseOnDone = false,
  className = "",
  brandedPhases = false,
}: ThinkingBlockProps): ReactElement {
  // ---- Controlled / uncontrolled open state -----------------------------
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(true);
  const openState = isControlled ? (open as boolean) : internalOpen;

  // Track whether the user has manually toggled, so we don't fight them
  // while auto-expanding during active thinking.
  const userToggledRef = useRef(false);

  const setOpen = useCallback(
    (next: boolean) => {
      userToggledRef.current = true;
      if (isControlled) {
        onOpenChange?.(next);
      } else {
        setInternalOpen(next);
      }
    },
    [isControlled, onOpenChange],
  );

  // Auto-expand while the model is actively thinking (unless the user has
  // explicitly collapsed it).  Optionally auto-collapse once thinking
  // completes.  Three separate effects have been merged into a single
  // hook so React processes the toggles atomically.
  useEffect(() => {
    if (isThinking) {
      userToggledRef.current = false;
      if (isControlled) {
        onOpenChange?.(true);
      } else {
        setInternalOpen(true);
      }
    } else if (autoCollapseOnDone) {
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setInternalOpen(false);
      }
      userToggledRef.current = false;
    }
  }, [isThinking, autoCollapseOnDone, isControlled, onOpenChange]);

  // ---- Branded phase cycling (KUDBEE thinking / wondering / etc.) -------
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isThinking && brandedPhases) {
      phaseTimerRef.current = setInterval(() => {
        setPhaseIndex((prev) => (prev + 1) % BRANDED_PHASES.length);
      }, 1800);
    } else {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
      setPhaseIndex(0);
    }
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [isThinking, brandedPhases]);

  const displayLabel = brandedPhases
    ? BRANDED_PHASES[phaseIndex]
    : isThinking
      ? `${label}…`
      : label;

  // ---- Derived text -----------------------------------------------------
  const text = useMemo(() => {
    if (segments && segments.length > 0) {
      return segments
        .filter((s) => s.kind === "thinking")
        .map((s) => s.text)
        .join("");
    }
    return thinking;
  }, [segments, thinking]);

  const hasContent = text.length > 0;
  const headerId = useId();
  const regionId = useId();

  // ---- Render -----------------------------------------------------------
  return (
    <div
      className={`thinking-block ${className}`.trim()}
      data-open={openState}
      data-thinking={isThinking}
      style={thinkingBlockStyle}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={openState}
        aria-controls={regionId}
        onClick={() => setOpen(!openState)}
        style={headerStyle}
      >
        <span aria-hidden="true" style={chevronStyle(openState)}>
          {openState ? "▾" : "▸"}
        </span>
        <span style={labelStyle} className="thinking-block__label">
          {displayLabel}
        </span>
        {isThinking && (
          <span className="thinking-block__pulse" style={pulseStyle} aria-hidden="true" />
        )}
        {!isThinking && hasContent && (
          <span style={metaStyle}>
            {text.length} chars
          </span>
        )}
      </button>

      {openState && (
        <pre
          id={regionId}
          role="region"
          aria-labelledby={headerId}
          className="thinking-block__content"
          style={contentStyle}
        >
          {hasContent ? text : "(no thinking content yet)"}
        </pre>
      )}
    </div>
  );
}

export default ThinkingBlock;

/* ------------------------------------------------------------------ */
/* Inline styles (keeps the component dependency-free and terminal-y). */
/* ------------------------------------------------------------------ */

const thinkingBlockStyle: CSSProperties = {
  border: "1px solid #2a2a3a",
  borderRadius: 6,
  background: "#0d0d12",
  margin: "8px 0",
  fontFamily:
    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
  fontSize: 13,
  color: "#c8c8d0",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 10px",
  background: "transparent",
  border: "none",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  userSelect: "none",
};

const chevronStyle = (open: boolean): CSSProperties => ({
  display: "inline-block",
  transition: "transform 120ms ease",
  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
  color: "#7c7c8a",
});

const labelStyle: CSSProperties = {
  fontWeight: 600,
  color: "#9a9ab0",
  letterSpacing: 0.3,
};

const metaStyle: CSSProperties = {
  marginLeft: "auto",
  color: "#5c5c6a",
  fontSize: 11,
};

const pulseStyle: CSSProperties = {
  marginLeft: "auto",
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#5b8cff",
  animation: "thinking-pulse 1s ease-in-out infinite",
};

const contentStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderTop: "1px solid #1f1f2a",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#8a8aa0",
  maxHeight: 320,
  overflowY: "auto",
};
