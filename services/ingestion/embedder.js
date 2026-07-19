const EMBEDDING_DIM = 256;

function hashToken(token) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function embedText(text) {
  const vec = new Array(EMBEDDING_DIM).fill(0);
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

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
}

export function embedTrace(reasoning, thoughtSummary, model) {
  const corpus = [thoughtSummary, reasoning, `model:${model}`].filter(Boolean).join(' ');
  return embedText(corpus);
}

export { EMBEDDING_DIM };
