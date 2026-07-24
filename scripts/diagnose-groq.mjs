try { process.loadEnvFile('.env'); } catch {}

import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API;
if (!apiKey) {
  console.error('[diagnose-groq] GROQ_API_KEY / GROQ_API is not set.');
  process.exit(1);
}

const client = new Groq({ apiKey });

async function diagnose() {
  try {
    const start = Date.now();
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a concise diagnostic assistant.' },
        { role: 'user', content: 'Reply with "OK" only.' }
      ],
      max_tokens: 16,
      temperature: 0
    });
    const latencyMs = Date.now() - start;
    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    console.log(`[diagnose-groq] Status: OK`);
    console.log(`[diagnose-groq] Model: ${completion.model ?? 'unknown'}`);
    console.log(`[diagnose-groq] Latency: ${latencyMs}ms`);
    console.log(`[diagnose-groq] Reply: ${text}`);
    process.exit(0);
  } catch (err) {
    console.error('[diagnose-groq] Failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

diagnose();
