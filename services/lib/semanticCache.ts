/**
 * services/lib/semanticCache.ts
 * ---------------------------------------------------------------------------
 * Redis LangCache semantic caching layer.
 *
 * Intercepts LLM prompts before they hit external APIs (Groq/Gemini). If a
 * high-confidence cached response exists for a semantically similar prompt,
 * it is returned immediately, saving tokens and latency. On cache miss, the
 * LLM response is asynchronously saved back to LangCache for future hits.
 *
 * Endpoint:  https://aws-us-east-1.langcache.redis.io/v1/caches/...
 * Auth:      Bearer token via LANGCACHE_API_KEY
 * Timeout:   3s — cache operations never block the request path
 * ---------------------------------------------------------------------------
 */

const LANGCACHE_ENDPOINT =
  process.env.LANGCACHE_ENDPOINT ||
  'https://aws-us-east-1.langcache.redis.io/v1/caches/b95111071db14e848cdbe9514138374d';

const LANGCACHE_API_KEY = process.env.LANGCACHE_API_KEY || '';
const CACHE_TIMEOUT_MS = 3_000;

let cacheConfigured = !!LANGCACHE_API_KEY;

if (!cacheConfigured) {
  console.warn('[LangCache] LANGCACHE_API_KEY not set — semantic cache disabled. Set the env var to enable.');
}

async function cacheFetch(
  path: string,
  body: Record<string, unknown>,
  label: string
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS);

  try {
    const res = await fetch(`${LANGCACHE_ENDPOINT}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LANGCACHE_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('abort')) {
      console.warn(`[LangCache] ${label} error: ${msg}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchSemanticCache(prompt: string): Promise<string | null> {
  if (!cacheConfigured || !prompt) return null;

  try {
    const res = await cacheFetch('/entries/search', { prompt }, 'search');
    if (!res || !res.ok) return null;

    const data = await res.json() as { result?: string; response?: string; text?: string };
    const cached = data?.result || data?.response || data?.text;
    return cached || null;
  } catch {
    return null;
  }
}

export async function saveSemanticCache(prompt: string, response: string): Promise<void> {
  if (!cacheConfigured || !prompt || !response) return;

  // Fire-and-forget — never block the response path
  cacheFetch('/entries', { prompt, response }, 'save').catch(() => {});
}

export { cacheConfigured };
