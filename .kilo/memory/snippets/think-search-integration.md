# Upstash Vector "think-search" — Integration Guide

## What

Dedicated Upstash Vector database for Kudbee's think/knowledge semantic search.
1536-dim HYBRID index (dense + BM25 sparse), DOT_PRODUCT similarity.
Hosted in GCP us-central1.

## Index

- **Name:** `think`
- **Type:** HYBRID (dense + sparse)
- **Dimension:** 1536 (matches pgvector embeddings)
- **Similarity:** DOT_PRODUCT
- **Sparse model:** BM25
- **Embedding model:** text-embedding-3-small (1536-d, OpenAI compatible)
- **Vectors:** 0 (clean, ready for think token indexing)

## CREDENTIALS — secret-safe

| Variable | Value (NAME ONLY) |
|:---|:---|
| `UPSTASH_SEARCH_REST_URL` | `https://obliging-shad-21310-gcp-usc1-search.upstash.io` |
| `UPSTASH_SEARCH_REST_TOKEN` | SET — never print, commit, or log. Fetch from Heroku staging config vars. |

Add to your `.env` or Heroku config:
```
UPSTASH_SEARCH_REST_URL="https://obliging-shad-21310-gcp-usc1-search.upstash.io"
UPSTASH_SEARCH_REST_TOKEN="<get from Heroku staging config vars>"
```

## API Endpoints

Base URL: `$UPSTASH_SEARCH_REST_URL` (no trailing slash or `/redis`)
Auth: `Authorization: Bearer $UPSTASH_SEARCH_REST_TOKEN`

| Method | Path | Purpose |
|:---|:---|:---|
| GET | `/info` | Index stats (vectorCount, dimension, namespace info) |
| POST | `/upsert/{index}` | Insert/update vectors — needs `vector`, `sparseVector`, `content`, `metadata` |
| POST | `/query/{index}` | Search — supports `vector` (dense), `data` (text→sparse), or both |
| POST | `/delete/{index}` | Delete vectors by ID |

## Upsert format (HYBRID index)

```json
{
  "id": "tk-001",
  "vector": [0.01, 0.02, ...],           // 1536-d float array
  "sparseVector": {                        // optional, auto-generated from content if omitted
    "indices": [0, 1, 2],
    "values": [0.5, 0.3, 0.2]
  },
  "content": {                             // required for BM25 search
    "text": "Semantic content of the think token"
  },
  "metadata": {                            // optional, filtered in queries
    "source": "dthink",
    "topic": "session-knowledge",
    "agent": "kiloh"
  }
}
```

## Query format

```json
// Dense-only (vector similarity)
{"topK": 5, "includeMetadata": true, "vector": [1536 floats]}

// Hybrid (dense + text search)
{"topK": 5, "includeMetadata": true, "vector": [1536 floats], "data": "search query text"}

// Text-only (sparse BM25)
{"topK": 5, "includeMetadata": true, "data": "search query text"}
```

## curl example

```bash
curl -s "https://obliging-shad-21310-gcp-usc1-search.upstash.io/info" \
  -H "Authorization: Bearer $UPSTASH_SEARCH_REST_TOKEN"
```

## Integration with Kudbee think tokens

1. When a think token is minted (`scripts/think-forge-bridge.mjs`), generate a 1536-d embedding
2. Upsert to `think` index with `content.text = token.summary` and `metadata = {source, topic, agent}`
3. Query with vector+dense for semantic recall, or text-only for keyword search
4. The `text-embedding-3-small` model is pre-configured. You can also pass your own 1536-d vectors.

## Verification

```bash
# Index is empty and ready
curl -s "$UPSTASH_SEARCH_REST_URL/info" -H "Authorization: Bearer $UPSTASH_SEARCH_REST_TOKEN"
# Expected: {"result":{"vectorCount":0,..."dimension":1536,..."indexType":"HYBRID"...}}
```
