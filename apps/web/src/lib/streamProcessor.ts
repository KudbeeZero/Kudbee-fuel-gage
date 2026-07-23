/**
 * Stream chunk processor for the local Ollama stream.
 *
 * Ollama emits newline-delimited JSON chunks (see {@link OllamaStreamChunk}).
 * Each chunk carries a small slice of the model's output. Two complications
 * make naive concatenation insufficient:
 *
 * 1. Thinking-capable models (e.g. `qwen3:8b`) emit reasoning either via the
 *    dedicated `message.thinking` field *or* inline within `message.content`
 *    wrapped in `</think>` tags.
 * 2. A single `</think>` or `</think>` delimiter can be split across two
 *    consecutive chunks, e.g. chunk A ends with `thin` and chunk B starts
 *    with `king>`.
 *
 * The {@link StreamChunkProcessor} is a small stateful machine that buffers
 * partial delimiters and emits a flat list of {@link StreamSegment}s so the
 * UI layer never has to reason about tag boundaries.
 */

import type {
  OllamaStreamChunk,
  StreamProcessorOptions,
  StreamSegment,
} from "../types/ollama";

/** Opening delimiter for an inline thinking block. */
const THINK_OPEN = "<think>";
/** Closing delimiter for an inline thinking block. */
const THINK_CLOSE = "</think>";

/**
 * Default options. Inline tag parsing is on by default because several
 * Ollama builds embed reasoning inside `content` rather than `thinking`.
 */
const DEFAULT_OPTIONS: Required<StreamProcessorOptions> = {
  parseInlineThinkTags: true,
};

/**
 * Result returned by {@link StreamChunkProcessor.flush} / {@link push}.
 * `segments` are the fully-parsed, ready-to-render pieces; `pending` is the
 * leftover text that could not yet be classified (kept for the next call).
 */
export interface ProcessResult {
  segments: StreamSegment[];
  pending: string;
}

/**
 * Stateful processor that converts a sequence of raw Ollama chunks into a
 * flat list of normalized {@link StreamSegment}s.
 */
export class StreamChunkProcessor {
  private readonly options: Required<StreamProcessorOptions>;

  /**
   * Buffer holding text that has not yet been emitted as a segment. This
   * accumulates content until we either hit a delimiter boundary or the
   * stream ends.
   */
  private buffer = "";

  /**
   * Whether we are currently inside a thinking block. Toggled by inline
   * `</think>` / `</think>` tags *and* by the presence of `thinking` field
   * content on incoming chunks.
   */
  private inThinking = false;

  /** All segments emitted so far across every call to {@link push}. */
  private readonly accumulated: StreamSegment[] = [];

  constructor(options: StreamProcessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Feed a single raw chunk into the processor.
   *
   * The chunk's `thinking` field (if present) is appended to the buffer
   * while `inThinking` is forced on, and its `content` field is appended
   * for normal (and optional inline-tag) parsing.
   *
   * @returns The new segments produced by this call (a subset of
   *   {@link allSegments}).
   */
  push(chunk: OllamaStreamChunk): StreamSegment[] {
    const before = this.accumulated.length;
    const message = chunk.message ?? { role: "assistant", content: "" };

    // 1. Handle the dedicated `thinking` field first. When the model emits
    //    reasoning through this field we treat it as an explicit thinking
    //    segment and ensure the inline parser does not double-count it.
    if (typeof message.thinking === "string" && message.thinking.length > 0) {
      this.inThinking = true;
      this.appendText(message.thinking, "thinking");
    }

    // 2. Handle `content`. This may contain inline `</think>` tags that we
    //    need to split on, or it may be plain visible content.
    if (typeof message.content === "string" && message.content.length > 0) {
      if (this.options.parseInlineThinkTags) {
        this.parseInline(message.content);
      } else {
        this.appendText(message.content, this.inThinking ? "thinking" : "content");
      }
    }

    // 3. When the stream is marked done, flush any buffered text so the UI
    //    never loses trailing characters.
    if (chunk.done) {
      this.flush();
    }

    return this.accumulated.slice(before);
  }

  /**
   * Parse a piece of `content` text, splitting it on inline `</think>` /
   * `</think>` delimiters while buffering partial delimiters that straddle
   * a chunk boundary.
   */
  private parseInline(text: string): void {
    this.buffer += text;

    let cursor = 0;
    // Walk the buffer looking for the next relevant delimiter.
    while (cursor < this.buffer.length) {
      const openIdx = this.buffer.indexOf(THINK_OPEN, cursor);
      const closeIdx = this.buffer.indexOf(THINK_CLOSE, cursor);

      // No delimiters at all: emit everything up to a safe boundary (we
      // must keep the tail in case it is the start of a partial delimiter).
      if (openIdx === -1 && closeIdx === -1) {
        this.emitUpToSafeBoundary(cursor);
        return;
      }

      // Pick whichever delimiter comes first.
      const nextDelim =
        closeIdx === -1
          ? openIdx
          : openIdx === -1
            ? closeIdx
            : Math.min(openIdx, closeIdx);

      // Emit any visible/thinking text that precedes the delimiter.
      if (nextDelim > cursor) {
        this.appendText(
          this.buffer.slice(cursor, nextDelim),
          this.inThinking ? "thinking" : "content",
        );
      }

      if (nextDelim === openIdx) {
        // Opening tag -> enter thinking mode and skip past the delimiter.
        this.inThinking = true;
        cursor = openIdx + THINK_OPEN.length;
      } else {
        // Closing tag -> exit thinking mode and skip past the delimiter.
        this.inThinking = false;
        cursor = closeIdx + THINK_CLOSE.length;
      }
    }

    // We consumed the entire buffer; reset it.
    this.buffer = "";
  }

  /**
   * Emit text from `cursor` up to the last position that is guaranteed not
   * to be the prefix of a delimiter. The remainder is kept in the buffer
   * for the next chunk.
   */
  private emitUpToSafeBoundary(cursor: number): void {
    const remaining = this.buffer.slice(cursor);
    // The longest delimiter is `</think>` (8 chars). Any tail shorter than
    // that *could* be a partial delimiter, so keep it buffered.
    const safeCut = Math.max(0, remaining.length - THINK_CLOSE.length);
    if (safeCut > 0) {
      this.appendText(
        remaining.slice(0, safeCut),
        this.inThinking ? "thinking" : "content",
      );
      this.buffer = remaining.slice(safeCut);
    } else {
      // Entire remainder is a potential partial delimiter; keep buffering.
      this.buffer = remaining;
    }
  }

  /** Append `text` to the accumulated segments under the given `kind`. */
  private appendText(text: string, kind: StreamSegment["kind"]): void {
    if (text.length === 0) return;
    const last = this.accumulated[this.accumulated.length - 1];
    // Coalesce adjacent segments of the same kind to keep the list compact.
    if (last && last.kind === kind) {
      last.text += text;
    } else {
      this.accumulated.push({ kind, text });
    }
  }

  /**
   * Flush any buffered text as a segment of the current kind. Called
   * automatically when a chunk with `done: true` is pushed, but exposed
   * for callers that want to finalize an interrupted stream.
   */
  flush(): ProcessResult {
    if (this.buffer.length > 0) {
      this.appendText(this.buffer, this.inThinking ? "thinking" : "content");
      this.buffer = "";
    }
    return { segments: [...this.accumulated], pending: this.buffer };
  }

  /** Every segment emitted so far. */
  allSegments(): StreamSegment[] {
    return [...this.accumulated];
  }

  /** Concatenated visible (non-thinking) content. */
  visibleText(): string {
    return this.accumulated
      .filter((s) => s.kind === "content")
      .map((s) => s.text)
      .join("");
  }

  /** Concatenated thinking content. */
  thinkingText(): string {
    return this.accumulated
      .filter((s) => s.kind === "thinking")
      .map((s) => s.text)
      .join("");
  }

  /** Whether the processor is currently inside a thinking block. */
  isThinking(): boolean {
    return this.inThinking;
  }

  /** Reset all internal state (e.g. before starting a new stream). */
  reset(): void {
    this.buffer = "";
    this.inThinking = false;
    this.accumulated.length = 0;
  }
}

/**
 * Convenience helper: synchronously process an *already-collected* array of
 * chunks (e.g. from a recorded session) into a flat segment list.
 */
export function processChunks(
  chunks: OllamaStreamChunk[],
  options?: StreamProcessorOptions,
): StreamSegment[] {
  const processor = new StreamChunkProcessor(options);
  for (const chunk of chunks) processor.push(chunk);
  processor.flush();
  return processor.allSegments();
}
