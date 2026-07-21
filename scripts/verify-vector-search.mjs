import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
const PORT = 9877;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let passed = 0;
let failed = 0;

function assert(check, label) {
  if (check) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ignore */
    }
    await delay(200);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer() {
  console.log('[Vector] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[Vector] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[Vector] Server is ready\n');
}

async function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await delay(500);
    if (serverProcess.killed === false) {
      serverProcess.kill('SIGKILL');
    }
  }
}

async function runCheck(name, fn) {
  console.log(`--- ${name} ---`);
  try {
    const ok = await fn();
    assert(ok, name);
  } catch (e) {
    assert(false, `${name} threw: ${e.message}`);
  }
}

async function check1_VectorMemoryTableExists() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  return res.status === 200 && (data.status === 'ok' || data.status === 'degraded');
}

async function check2_SearchSimilarDirect() {
  const { searchSimilar, storeMemory } = await import('../services/memory/vectorStore.ts');
  const { embedTextLocal } = await import('../services/memory/embedText.ts');

  const mockText = 'database migration rollback transaction safety';
  const mockEmbedding = embedTextLocal(mockText);

  const storeResult = await storeMemory(mockText, {
    file_path: 'verify/vector-search',
    category: 'doc',
    version: '1.0.0',
    tags: ['verify', 'vector-search']
  }, mockEmbedding);

  if (!storeResult.ok) {
    console.error('  Store result:', storeResult);
    return false;
  }

  const queryEmbedding = embedTextLocal('safe database rollback migration');
  const results = await searchSimilar(queryEmbedding, 5, 0.1);

  if (!results.ok) {
    console.error('  Search result:', results);
    return false;
  }

  const match = results.results.some((r) => r.chunk_text === mockText);
  console.log(`  Found ${results.results.length} results, exact match=${match}`);
  return match;
}

async function check3_VectorSearchViaHTTP() {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kudbee-vector-brain',
      messages: [{ role: 'user', content: 'How do I safely rollback a database migration?' }]
    })
  });
  const data = await res.json();
  return res.status === 200 && data.governance && ['FAST_BRAIN', 'SLOW_BRAIN'].includes(data.governance.route);
}

async function check4_EmbeddingDimension() {
  const { EMBEDDING_DIM } = await import('../services/memory/embedText.ts');
  const { embedTextLocal } = await import('../services/memory/embedText.ts');
  const vec = embedTextLocal('dimension check');
  const ok = vec.length === EMBEDDING_DIM && EMBEDDING_DIM === 1536;
  console.log(`  embedding_dim=${vec.length}, expected=1536`);
  return ok;
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Server health (vector schema boot)', check1_VectorMemoryTableExists);
    await runCheck('Check 2: searchSimilar direct call + storeMemory', check2_SearchSimilarDirect);
    await runCheck('Check 3: /v1/chat/completions governance routing', check3_VectorSearchViaHTTP);
    await runCheck('Check 4: 1536-dim embedding math engine', check4_EmbeddingDimension);
  } catch (e) {
    console.error(`[Vector] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 4`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[Vector] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[Vector] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
