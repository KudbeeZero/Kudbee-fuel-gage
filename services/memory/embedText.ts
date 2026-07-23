/**
 * services/memory/embedText.ts
 * ---------------------------------------------------------------------------
 * Embedding utilities for the Self-Aware Vector Memory Layer.
 *
 * Real embeddings target the text-embedding dimension (1536) via the Gemini
 * `embedContent` API when GEMINI_API_KEY is present. When the key is absent
 * (local dev / CI), we fall back to a deterministic 1536-dim hashed vector so
 * the self-ingestion pipeline and similarity search remain fully operational.
 * ---------------------------------------------------------------------------
 */

export const EMBEDDING_DIM = 1536;

function hashToken(token: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Deterministic local embedding (offline fallback). Produces a normalized
 * 1536-dim vector. NOT semantically rich — used only when no LLM key is set.
 */
export function embedTextLocal(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    const h = hashToken(token);
    const bucket = h % EMBEDDING_DIM;
    vec[bucket] = (vec[bucket] ?? 0) + 1;
    const second = Math.floor(h / EMBEDDING_DIM) % EMBEDDING_DIM;
    vec[second] = (vec[second] ?? 0) + 0.5;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

interface GeminiEmbedResponse {
  embeddings?: { values?: number[] }[];
}

/**
 * Generates a real 1536-dim embedding via the Gemini embedContent API.
 * Returns null when the API is unavailable so callers can fall back locally.
 */
export async function embedTextRemote(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
        signal: controller.signal
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiEmbedResponse;
    const values = data.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length > 0 ? values : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resilient embedding: real when possible, deterministic local otherwise. */
export async function embedText(text: string): Promise<number[]> {
  const remote = await embedTextRemote(text);
  if (remote && remote.length === EMBEDDING_DIM) return remote;
  return embedTextLocal(text);
}
