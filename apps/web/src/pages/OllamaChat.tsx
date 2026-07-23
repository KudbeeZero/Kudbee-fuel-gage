/**
 * OllamaChat
 * ---------
 * Full-page view that wires the {@link useOllamaStream} hook to a chat
 * interface with a terminal-style streaming output via
 * {@link TerminalStreamView}.
 *
 * Features:
 *  - Model selector (defaults to `qwen3:8b` — the thinking-capable model
 *    the stream processor was built for).
 *  - Chat history displayed as user bubbles + terminal stream blocks.
 *  - Auto-scroll to the latest assistant response.
 *  - Persistent model preference via `localStorage`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useOllamaStream } from "../hooks/useOllamaStream";
import { useToolInterceptor } from "../hooks/useToolInterceptor";
import { useThoughtTelemetry } from "../hooks/useThoughtTelemetry";
import { registerWorkspaceTools } from "../tools/workspace";
import { TerminalStreamView } from "../components/TerminalStreamView";
import type { OllamaMessage, StreamStatus } from "../types/ollama";
import type { ReactElement, FormEvent, KeyboardEvent } from "react";

// Register workspace tools once at module load.
registerWorkspaceTools();

/* ------------------------------------------------------------------ */
/* Top models commonly used with Ollama (subset).                      */
/* ------------------------------------------------------------------ */
const AVAILABLE_MODELS = [
  { id: "qwen3:8b", label: "Qwen 3 (8B) — thinking" },
  { id: "llama3.2:3b", label: "Llama 3.2 (3B)" },
  { id: "llama3.2:1b", label: "Llama 3.2 (1B)" },
  { id: "mistral:7b", label: "Mistral (7B)" },
  { id: "codellama:7b", label: "Code Llama (7B)" },
  { id: "phi3:mini", label: "Phi-3 Mini" },
];

const LS_MODEL_KEY = "ollama_chat_model";

function loadModelPref(): string {
  try {
    return localStorage.getItem(LS_MODEL_KEY) ?? "qwen3:8b";
  } catch {
    return "qwen3:8b";
  }
}

function saveModelPref(model: string): void {
  try {
    localStorage.setItem(LS_MODEL_KEY, model);
  } catch {
    /* localStorage unavailable — no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Chat message rendered in the scrollable history.                    */
/* ------------------------------------------------------------------ */
interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  /** Stream segments captured for this assistant turn (if any). */
  segments?: ReturnType<typeof useOllamaStream>["segments"];
  status?: StreamStatus;
  isThinking?: boolean;
  error?: string | null;
  model?: string;
}

function ChatBubble({
  entry,
  toolState,
}: {
  entry: ChatEntry;
  toolState?: "idle" | "executing" | "done";
}): ReactElement {
  if (entry.role === "user") {
    return (
      <div style={userBubbleStyle}>
        <span style={roleTagStyle("user")}>YOU</span>
        <div style={{ whiteSpace: "pre-wrap" }}>{entry.content}</div>
      </div>
    );
  }

  /* Assistant turn — render via TerminalStreamView if segments are
     available, otherwise fall back to plain text. */
  if (entry.segments && entry.segments.length > 0) {
    return (
      <TerminalStreamView
        segments={entry.segments}
        status={entry.status ?? "done"}
        isThinking={entry.isThinking ?? false}
        model={entry.model}
        error={entry.error}
        title={entry.model ? `ollama — ${entry.model}` : "ollama — streaming"}
        autoScroll={false}
        toolState={toolState}
      />
    );
  }

  return (
    <div style={assistantPlaceholderStyle}>
      <span style={roleTagStyle("assistant")}>ASSISTANT</span>
      <div style={{ whiteSpace: "pre-wrap" }}>
        {entry.content || "(empty response)"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page component                                                 */
/* ------------------------------------------------------------------ */
export function OllamaChat(): ReactElement {
  const [model, setModel] = useState<string>(loadModelPref);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");

  // Control-panel knobs (persisted in localStorage).
  const [controlsOpen, setControlsOpen] = useState(
    () => localStorage.getItem("ollama_ctrls_open") !== "false",
  );
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem("ollama_system_prompt") ?? "",
  );
  const [temperature, setTemperature] = useState(
    () => Number(localStorage.getItem("ollama_temp") ?? 0.7),
  );
  const [numCtx, setNumCtx] = useState(
    () => Number(localStorage.getItem("ollama_numctx") ?? 2048),
  );
  const [numPredict, setNumPredict] = useState(
    () => Number(localStorage.getItem("ollama_numpredict") ?? -1),
  );

  const historyRef = useRef<HTMLDivElement | null>(null);
  const stream = useOllamaStream({ model, enabled: true });
  const tools = useToolInterceptor();
  const telemetry = useThoughtTelemetry(model);

  // Post thinking traces to telemetry when stream completes.
  const postedRef = useRef(false);
  useEffect(() => {
    if (stream.status === "done" && stream.segments.length > 0 && !postedRef.current) {
      postedRef.current = true;
      telemetry.postTelemetry(stream.segments, stream.session);
    }
  }, [stream.status, stream.segments, stream.session, telemetry]);

  // Reset tool/telemetry state on new stream.
  useEffect(() => {
    if (stream.status === "streaming" && stream.segments.length === 0) {
      tools.reset();
      telemetry.reset();
      postedRef.current = false;
    }
  }, [stream.status, stream.segments.length, tools, telemetry]);

  // Tool-call interception: after stream finishes, scan for tool_calls
  // in the visible content, execute tools, and feed results back.
  const toolLoopRef = useRef(false);

  // Refs to keep the effect deps minimal while accessing the latest
  // values of mutable state inside the async tool-interception callback.
  const sendRef = useRef(stream.send);
  sendRef.current = stream.send;
  const histForToolsRef = useRef(history);
  histForToolsRef.current = history;
  const systemPromptRef = useRef(systemPrompt);
  systemPromptRef.current = systemPrompt;
  const temperatureRef = useRef(temperature);
  temperatureRef.current = temperature;
  const numCtxRef = useRef(numCtx);
  numCtxRef.current = numCtx;
  const numPredictRef = useRef(numPredict);
  numPredictRef.current = numPredict;

  useEffect(() => {
    if (stream.status !== "done" || toolLoopRef.current) return;
    const text = stream.visibleText;
    if (!text) return;

    toolLoopRef.current = true;
    tools.intercept(text).then((events) => {
      if (events.length > 0) {
        const resultMsgs = tools.buildToolResultMessages(events);
        // Feed tool results as a continuation of the conversation.
        const allMsgs: OllamaMessage[] = [
          ...histForToolsRef.current
            .filter((h) => h.role === "user" || h.role === "assistant")
            .map((h) => ({ role: h.role as OllamaMessage["role"], content: h.content })),
          ...resultMsgs,
        ];
        sendRef.current(allMsgs, {
          system: systemPromptRef.current || undefined,
          temperature: temperatureRef.current,
          numCtx: numCtxRef.current > 0 ? numCtxRef.current : undefined,
          numPredict: numPredictRef.current > 0 ? numPredictRef.current : undefined,
        });
      }
      toolLoopRef.current = false;
    });
  }, [stream.status, stream.visibleText]);

  const persist = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  };

  const handleModelChange = useCallback(
    (next: string) => {
      setModel(next);
      saveModelPref(next);
      stream.stop();
    },
    [stream],
  );

  const handleSend = useCallback(
    async (messages: OllamaMessage[], opts?: Parameters<typeof stream.send>[1]) => {
      if (stream.status === "streaming") return;
      await stream.send(messages, opts);
    },
    [stream],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || stream.status === "streaming") return;

    const userMsg: OllamaMessage = { role: "user", content: trimmed };
    const historyMsgs: OllamaMessage[] = [
      ...history
        .filter((h) => h.role === "user" || h.role === "assistant")
        .map((h) => ({
          role: h.role as OllamaMessage["role"],
          content: h.content,
        })),
      userMsg,
    ];

    setHistory((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    handleSend(historyMsgs, {
      system: systemPrompt || undefined,
      temperature,
      numCtx: numCtx > 0 ? numCtx : undefined,
      numPredict: numPredict > 0 ? numPredict : undefined,
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  /* Append the assistant response to history once the stream completes. */
  useEffect(() => {
    if ((stream.status === "done" || stream.status === "error") && stream.segments.length > 0) {
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.segments) return prev;
        return [
          ...prev,
          {
            role: "assistant",
            content: stream.visibleText,
            segments: stream.segments,
            status: stream.status,
            isThinking: stream.isThinking,
            error: stream.error,
            model,
          },
        ];
      });
    }
  }, [stream.status, stream.segments, stream.visibleText, stream.isThinking, stream.error, model]);

  const liveEntry: ChatEntry = {
    role: "assistant",
    content: stream.visibleText,
    segments: stream.segments,
    status: stream.status,
    isThinking: stream.isThinking,
    error: stream.error,
    model,
  };

  const isBusy = stream.status === "streaming";

  const handleCopy = (text: string) => {
    // copying is handled inside TerminalStreamView via navigator.clipboard
  };

  const handleClear = useCallback(() => {
    if (isBusy) return;
    setHistory([]);
    stream.stop();
  }, [isBusy, stream]);

  return (
    <div style={pageStyle}>
      {/* Header: model selector + status */}
      <div style={headerStyle}>
        <label style={selectLabelStyle}>
          Model:
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            style={selectStyle}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stream.session.evalCount > 0 && (
            <span style={sessionBadgeStyle}>
              {stream.session.evalCount} tok • {stream.session.tokensPerSecond} t/s
            </span>
          )}
          <span style={statusBadgeStyle(stream.status)}>{stream.status}</span>
        </div>
      </div>

      {/* Controls panel (collapsible) */}
      <div style={controlsToggleStyle}>
        <button
          type="button"
          onClick={() => {
            const next = !controlsOpen;
            setControlsOpen(next);
            persist("ollama_ctrls_open", String(next));
          }}
          style={controlsToggleBtnStyle}
        >
          {controlsOpen ? "▾" : "▸"} Controls
        </button>
      </div>
      {controlsOpen && (
        <div style={controlsPanelStyle}>
          {/* System prompt */}
          <div style={controlRowStyle}>
            <label style={controlLabelStyle}>System:</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                persist("ollama_system_prompt", e.target.value);
              }}
              placeholder="Optional system prompt…"
              rows={2}
              style={controlInputStyle}
            />
          </div>
          {/* Temperature */}
          <div style={controlRowStyle}>
            <label style={controlLabelStyle}>
              Temp: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTemperature(v);
                persist("ollama_temp", String(v));
              }}
              style={rangeStyle}
            />
          </div>
          {/* Context window */}
          <div style={controlRowStyle}>
            <label style={controlLabelStyle}>Context:</label>
            <select
              value={numCtx}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNumCtx(v);
                persist("ollama_numctx", String(v));
              }}
              style={controlInputStyle}
            >
              <option value={512}>512</option>
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
              <option value={4096}>4096</option>
              <option value={8192}>8192</option>
            </select>
          </div>
          {/* Max tokens */}
          <div style={controlRowStyle}>
            <label style={controlLabelStyle}>Max tokens:</label>
            <select
              value={numPredict}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNumPredict(v);
                persist("ollama_numpredict", String(v));
              }}
              style={controlInputStyle}
            >
              <option value={-1}>default</option>
              <option value={256}>256</option>
              <option value={512}>512</option>
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
              <option value={4096}>4096</option>
            </select>
          </div>
        </div>
      )}

      {/* Chat history */}
      <div ref={historyRef} style={chatBodyStyle}>
        {history.map((entry, i) => (
          <ChatBubble key={i} entry={entry} toolState={tools.toolState} />
        ))}

        {isBusy && (
          <div style={{ marginTop: 12 }}>
            <ChatBubble entry={liveEntry} toolState={tools.toolState} />
          </div>
        )}

        {history.length === 0 && !isBusy && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🦙</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              KUDBEE Terminal
            </div>
            <div style={{ color: "#6a6a78", fontSize: 12 }}>
              Select a model, tune the controls, and send a message.
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={onSubmit} style={inputAreaStyle}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isBusy ? "Waiting for response…" : `Message ${model}…`}
          disabled={isBusy}
          rows={2}
          style={textareaStyle}
        />
        <button
          type="submit"
          disabled={isBusy || input.trim().length === 0}
          style={sendBtnStyle(isBusy || input.trim().length === 0)}
        >
          {isBusy ? "···" : "Send"}
        </button>
      </form>
    </div>
  );
}

export default OllamaChat;

/* ------------------------------------------------------------------ */
/* Inline styles                                                       */
/* ------------------------------------------------------------------ */

const pageStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0a0a0f",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #1f1f2a",
  background: "#0d0d14",
  flexShrink: 0,
};

const selectLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 12,
  color: "#9a9ab0",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const selectStyle: React.CSSProperties = {
  background: "#12121a",
  color: "#d6d6e0",
  border: "1px solid #2a2a3a",
  borderRadius: 6,
  padding: "4px 10px",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
};

const statusBadgeStyle = (status: StreamStatus): React.CSSProperties => ({
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  padding: "2px 10px",
  borderRadius: 4,
  background:
    status === "streaming"
      ? "#0a2e1a"
      : status === "error"
        ? "#2e0a0a"
        : status === "done"
          ? "#1a1a2e"
          : "#12121a",
  color:
    status === "streaming"
      ? "#27c93f"
      : status === "error"
        ? "#ff5f56"
        : status === "done"
          ? "#5b8cff"
          : "#6a6a78",
  border: "1px solid",
  borderColor:
    status === "streaming"
      ? "#1a5c2a"
      : status === "error"
        ? "#5c1a1a"
        : status === "done"
          ? "#2a2a5c"
          : "#1f1f2a",
});

const chatBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const inputAreaStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid #1f1f2a",
  background: "#0d0d14",
  flexShrink: 0,
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: "none",
  background: "#12121a",
  color: "#d6d6e0",
  border: "1px solid #2a2a3a",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  lineHeight: 1.4,
  outline: "none",
};

const sendBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0 16px",
  background: disabled ? "#12121a" : "#1a2a4a",
  color: disabled ? "#4a4a58" : "#c8d6f0",
  border: `1px solid ${disabled ? "#1f1f2a" : "#2a3a5c"}`,
  borderRadius: 8,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  whiteSpace: "nowrap",
});

const userBubbleStyle: React.CSSProperties = {
  background: "#0d1a2d",
  border: "1px solid #1a2a40",
  borderRadius: 8,
  padding: "10px 14px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  color: "#c8d6f0",
};

const assistantPlaceholderStyle: React.CSSProperties = {
  background: "#0d0d12",
  border: "1px solid #1f1f2a",
  borderRadius: 8,
  padding: "10px 14px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  color: "#a0a0b0",
};

const roleTagStyle = (role: "user" | "assistant"): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  padding: "1px 6px",
  borderRadius: 3,
  marginBottom: 6,
  color: role === "user" ? "#5b8cff" : "#27c93f",
  background: role === "user" ? "#0d1a2d" : "#0a1a0a",
  border: `1px solid ${role === "user" ? "#1a2a40" : "#1a2a1a"}`,
});

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#5c5c6a",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};

/* ---- Controls panel styles ---- */

const controlsToggleStyle: React.CSSProperties = {
  padding: "0 16px",
  background: "#0a0a0f",
  borderBottom: "1px solid #1f1f2a",
  flexShrink: 0,
};

const controlsToggleBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#7c7c8a",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 0",
  cursor: "pointer",
};

const controlsPanelStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px 20px",
  padding: "10px 16px",
  background: "#08080d",
  borderBottom: "1px solid #1f1f2a",
  flexShrink: 0,
};

const controlRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const controlLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  color: "#7c7c8a",
  whiteSpace: "nowrap",
  minWidth: 55,
};

const controlInputStyle: React.CSSProperties = {
  background: "#12121a",
  color: "#d6d6e0",
  border: "1px solid #2a2a3a",
  borderRadius: 5,
  padding: "4px 8px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  outline: "none",
  width: "100%",
  maxWidth: 200,
  resize: "none",
};

const rangeStyle: React.CSSProperties = {
  width: 120,
  accentColor: "#5b8cff",
};

const sessionBadgeStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 10,
  color: "#5b8cff",
  background: "#0d1a2d",
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid #1a2a40",
};
