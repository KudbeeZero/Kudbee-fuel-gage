#!/usr/bin/env node
/**
 * scripts/inject-knowledge-tokens.mjs
 * ---------------------------------------------------------------------------
 * Reads .kilo/memory/tokens/*.token files and injects them into the
 * Think Token Forge (pgvector think_tokens table) via the server API.
 *
 * Each token becomes a semantically searchable "correction delta" —
 * when future agents query the Token Forge, these pre-seeded tokens
 * provide codebase context without requiring prior correction history.
 *
 * Usage: node scripts/inject-knowledge-tokens.mjs [--dry-run]
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const TOKENS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'tokens');
const DRY_RUN = process.argv.includes('--dry-run');

const files = existsSync(TOKENS_DIR) ? readdirSync(TOKENS_DIR).filter(f => f.endsWith('.token')) : [];
console.log(`Found ${files.length} knowledge tokens\n`);

if (DRY_RUN) {
  for (const file of files) {
    const content = readFileSync(join(TOKENS_DIR, file), 'utf8');
    const firstLine = content.split('\n')[0] || '';
    const size = content.length;
    console.log(`  [DRY] ${file} — ${size}B — ${firstLine.slice(0, 80)}`);
  }
  console.log(`\n  Dry run complete. Remove --dry-run to inject.`);
  process.exit(0);
}

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

for (const file of files) {
  const filePath = join(TOKENS_DIR, file);
  const content = readFileSync(filePath, 'utf8');
  const tokenId = file.replace('.token', '');
  const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#')) || '';

  try {
    const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Pass': process.env.KUDBEE_AGENT_PASS || 'dev',
        'X-Trace-Id': `inject-${tokenId}-${Date.now()}`,
      },
      body: JSON.stringify({
        task_context: { source: 'codebase-knowledge-extraction', tokenId, extractedAt: new Date().toISOString() },
        correction_delta: content,
        status: 'PROVEN',
      }),
    });

    if (res.ok) {
      console.log(`  [+] ${tokenId} (${content.length}B) -> ${firstLine.slice(0, 60)}`);
    } else {
      const body = await res.text();
      console.log(`  [!] ${tokenId} failed (${res.status}): ${body.slice(0, 100)}`);
    }
  } catch (err) {
    console.log(`  [-] ${tokenId} inject error: ${err.message}`);
  }
}

console.log(`\n  Injected ${files.length} tokens into Think Token Forge.`);
console.log(`  Verify: SELECT * FROM think_tokens WHERE task_context->>'source' = 'codebase-knowledge-extraction';`);
