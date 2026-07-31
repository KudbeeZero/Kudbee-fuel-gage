# Qwen Verification Learning

## Verified Work

- Qwen/Ollama stream types exist in `apps/web/src/types/ollama.ts`.
- Thinking output is handled by `StreamChunkProcessor`.
- Tool-call interception exists in `useToolInterceptor.ts`.
- Local model examples include `qwen3:8b`.
- The THINK benchmark specification lists Qwen as a comparison model.

## Gap Found

When Ollama emits a dedicated `message.thinking` field and visible
`message.content` in the same chunk, the parser previously left its inline
thinking state enabled. Visible content could therefore be classified as
thinking output.

## Correction

Dedicated thinking output now closes its state before processing same-chunk
visible content. Inline `<think>...</think>` parsing remains available for
models that embed reasoning in `content`.

## Evidence

- TypeScript gate must remain 12/12.
- Qwen model execution was not available in this ephemeral session because no
  Ollama runtime or model endpoint was present.
- This is a code-level verification, not a claim of a live Qwen benchmark.

## Promotion Rule

Promote Qwen THINK artifacts only after recording model ID, prompt, runtime,
tool calls, token counts, latency, cost, final verification result, and any
human correction. Do not treat comments or model examples as execution proof.
