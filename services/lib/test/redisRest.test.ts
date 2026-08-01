import { describe, expect, mock, test } from 'bun:test';

describe('redis REST command transport', () => {
  test('encodes each Redis argument as one URL segment', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/lpush/kudbee%3Aqueue/%7B%22prompt%22%3A%22a%2Fb%20c%22%7D');
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const { restCmd } = await import('../redisRest.js');
      await expect(restCmd('lpush', 'kudbee:queue', '{"prompt":"a/b c"}')).resolves.toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
