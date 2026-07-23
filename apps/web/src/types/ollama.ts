/**
 * Shared type definitions for the local Ollama streaming integration.
 *
 * These mirror the JSON shape returned by the Ollama `/api/chat` (and
 * `/api/generate`) streaming endpoints. When `stream: true` is sent in the
 * request body, Ollama emits one {@link OllamaStreamChunk} per token (or
 * small token group) as newline-delimited JSON (NDJSON).
 */

/** A single role within an Ollama chat message. */
export type OllamaRole = "system" | "user" | "assistant";

/** A discrete message emitted by Ollama inside a stream chunk. */
export interface OllamaMessage {
  role: OllamaRole;
  /** The visible assistant content produced for this chunk. */
  content: string;
  /**
   * The "thinking" / reasoning content produced for this chunk.
   *
   * Thinking-capable models (e.g. `qwen3:8b`) populate this field while
   * they reason. The raw model output also wraps reasoning in `<think>…
   * </think>` tags, so callers should be prepared to receive thinking
   * content either via this field *or* inline within `content`.
   */
  thinking?: string;
  images?: string[];
}

/** A single NDJSON chunk emitted by the Ollama streaming endpoint. */
export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  /** Present only on the final chunk (`done: true`). */
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Options forwarded to Ollama's `/api/chat` endpoint.
 *
 * These are the tunable knobs exposed in the OllamaChat control panel.
 */
export interface ChatRequestOptions {
  /**
   * System prompt injected before the first user message.
   * Maps to `messages[0] = { role: "system", content: ... }`.
   */
  readonly system?: string;
  /** Model temperature (0.0–2.0). Lower = more deterministic. */
  readonly temperature?: number;
  /**
   * Context window size in tokens. Maps to Ollama's `options.num_ctx`.
   * Larger values allow the model to reference more conversation history
   * but increase memory usage and latency.
   */
  readonly numCtx?: number;
  /**
   * Top-p nucleus sampling. Maps to Ollama's `options.top_p`.
   * Lower values = more focused; higher = more creative.
   */
  readonly topP?: number;
  /**
   * Maximum tokens to generate. Maps to `options.num_predict`.
   * Ollama defaults to 128 if not set.
   */
  readonly numPredict?: number;
}

/**
 * The logical "kind" of content a parsed token belongs to.
 *
 * The stream parser splits raw model output into either visible content or
 * reasoning content based on `<think>` / `</think>` delimiters (and the
 * `thinking` field on the chunk).
 */
export type StreamSegmentKind = "content" | "thinking";

/**
 * A parsed, normalized segment produced by the chunk processor.
 *
 * The processor consumes raw {@link OllamaStreamChunk}s and emits a flat
 * list of these segments so the UI never has to deal with tag parsing.
 */
export interface StreamSegment {
  /** Whether this segment is visible content or hidden reasoning. */
  kind: StreamSegmentKind;
  /** The text payload for this segment. */
  text: string;
}

/** Options accepted by the stream chunk processor. */
export interface StreamProcessorOptions {
  /**
   * When `true`, the processor also inspects `message.content` for inline
   * `<think>` / `</think>` tags. Defaults to `true` because some Ollama
   * builds embed reasoning inside `content` rather than `thinking`.
   */
  readonly parseInlineThinkTags?: boolean;
}

/** Status of the active streaming session. */
export type StreamStatus = "idle" | "streaming" | "done" | "error";

/**
 * KUDBEE-branded thinking phase labels.
 *
 * The UI cycles through these while the model is producing reasoning
 * content, giving the terminal a lively, branded feel.
 */
export type ThinkingPhase =
  | "KUDBEE thinking…"
  | "KUDBEE wondering…"
  | "KUDBEE reasoning…"
  | "KUDBEE analyzing…"
  | "KUDBEE verifying…"
  | "KUDBEE reflecting…";

/**
 * Snapshot of the stream session for rendering metadata (speed gauge,
 * token count, duration, etc.).
 */
export interface StreamSessionState {
  /** Total tokens evaluated so far (from the last `done` chunk). */
  evalCount: number;
  /** Total prompt tokens consumed. */
  promptEvalCount: number;
  /** Wall-clock duration in nanoseconds (from final chunk). */
  totalDuration: number;
  /** Model load duration in nanoseconds (from final chunk). */
  loadDuration: number;
  /** Approximate tokens per second computed after the stream ends. */
  tokensPerSecond: number;
}
