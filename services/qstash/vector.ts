// services/qstash/vector.ts
// ---------------------------------------------------------------------------
// External Logic Phase — Think-Search Vector Bridge
//
// Connects to Upstash Vector "think" index for semantic agent knowledge search.
// 1536-dim HYBRID index (dense + BM25 sparse), DOT_PRODUCT similarity.
// Index: think  |  URL: UPSTASH_SEARCH_REST_URL  |  Auth: Bearer token
// ---------------------------------------------------------------------------

const SEARCH_URL =
  process.env.UPSTASH_SEARCH_REST_URL || 'https://obliging-shad-21310-gcp-usc1-search.upstash.io';
const SEARCH_TOKEN = process.env.UPSTASH_SEARCH_REST_TOKEN || '';

interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

// ── Dense vector query ─────────────────────────────────────────────────────

export async function queryByVector(
  vector: number[],
  topK = 5,
): Promise<SearchResult[]> {
  const res = await fetch(`${SEARCH_URL}/query/think`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SEARCH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topK, includeMetadata: true, vector }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Vector query failed: ${res.status} ${JSON.stringify(err)}`);
  }

  const json = await res.json() as { result?: SearchResult[] };
  return json.result ?? [];
}

// ── Hybrid (dense + text) query ────────────────────────────────────────────

export async function queryHybrid(
  vector: number[],
  queryText: string,
  topK = 5,
): Promise<SearchResult[]> {
  const res = await fetch(`${SEARCH_URL}/query/think`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SEARCH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topK, includeMetadata: true, vector, data: queryText }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Hybrid query failed: ${res.status} ${JSON.stringify(err)}`);
  }

  const json = await res.json() as { result?: SearchResult[] };
  return json.result ?? [];
}

// ── Text-only (BM25 sparse) query ──────────────────────────────────────────

export async function queryText(queryText: string, topK = 5): Promise<SearchResult[]> {
  const res = await fetch(`${SEARCH_URL}/query/think`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SEARCH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topK, includeMetadata: true, data: queryText }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Text query failed: ${res.status} ${JSON.stringify(err)}`);
  }

  const json = await res.json() as { result?: SearchResult[] };
  return json.result ?? [];
}

// ── Upsert (index think tokens) ────────────────────────────────────────────

export async function upsertThinkToken(params: {
  id: string;
  vector: number[];
  content: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const res = await fetch(`${SEARCH_URL}/upsert/think`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SEARCH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: params.id,
      vector: params.vector,
      content: { text: params.content },
      metadata: params.metadata ?? {},
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Upsert failed: ${res.status} ${JSON.stringify(err)}`);
  }
}

// ── Index info ─────────────────────────────────────────────────────────────

export async function getIndexInfo() {
  const res = await fetch(`${SEARCH_URL}/info`, {
    headers: { Authorization: `Bearer ${SEARCH_TOKEN}` },
  });

  if (!res.ok) throw new Error(`Index info failed: ${res.status}`);
  return res.json() as Promise<{ result: { vectorCount: number; dimension: number; indexType: string } }>;
}
