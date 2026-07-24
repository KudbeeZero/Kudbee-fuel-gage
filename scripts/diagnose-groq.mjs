const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

async function diagnoseGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[Groq-Diag] GROQ_API_KEY is not set.');
    process.exit(1);
  }

  const url = `${GROQ_BASE_URL}/chat/completions`;
  const body = {
    model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    console.log(`[Groq-Diag] Status: ${res.status} ${res.statusText}`);
    console.log('[Groq-Diag] Rate limit headers:');
    const rateLimitHeaders = [
      'x-ratelimit-limit-requests',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-limit-tokens',
      'x-ratelimit-remaining-tokens',
      'x-ratelimit-reset-requests',
      'x-ratelimit-reset-tokens'
    ];
    for (const header of rateLimitHeaders) {
      const value = res.headers.get(header);
      if (value) {
        console.log(`  ${header}: ${value}`);
      }
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Groq-Diag] Response body: ${text}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[Groq-Diag] Request failed: ${err.message}`);
    process.exit(1);
  }
}

diagnoseGroq();
