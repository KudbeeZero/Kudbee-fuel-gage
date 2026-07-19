#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = 5060;
const BASE = `http://localhost:${PORT}`;

function log(line) {
  console.log(`[Verify] ${line}`);
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port || String(PORT),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await request('GET', '/health');
      if (res.status === 200) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function runVerification() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      log(`PASS: ${message}`);
      passed++;
    } else {
      log(`FAIL: ${message}`);
      failed++;
    }
  }

  let server;
  try {
    log('Starting verification server...');
    server = spawn('node', ['services/ingestion/server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
      stdio: 'ignore'
    });

    server.on('error', (err) => {
      log(`FATAL: Server spawn error: ${err.message}`);
      process.exit(1);
    });

    const ready = await waitForServer();
    assert(ready, 'Server started and responded to health check (200)');

    if (!ready) {
      log('Server did not start in time. Aborting.');
      server.kill('SIGTERM');
      process.exit(1);
    }

    log('Step 1: Ingest telemetry event...');
    const ingestBody = {
      trace_id: `verify-${Date.now()}`,
      model: 'gpt-4o',
      tokens_in: 100,
      tokens_out: 50,
      cost: 0.01,
      status: 'OK',
      provider: 'OpenAI',
      project_name: 'kudbee-fuel-gauge',
      thought_summary: 'Verification test telemetry',
      reasoning: 'End-to-end verification of vector memory integration'
    };

    let ingestRes;
    try {
      ingestRes = await request('POST', '/api/telemetry/ingest', ingestBody);
    } catch (err) {
      log(`FAIL: Ingest request threw: ${err.message}`);
      ingestRes = { status: 0, body: {} };
    }
    assert(ingestRes.status === 201, `Ingest returned 201 (got ${ingestRes.status})`);
    assert(ingestRes.body && ingestRes.body.success === true, 'Ingest response has success: true');

    await sleep(1000);

    log('Step 2: Query session history (Redis fallback)...');
    let historyRes;
    try {
      historyRes = await request('GET', '/api/session-history?limit=10');
    } catch (err) {
      log(`FAIL: Session history request threw: ${err.message}`);
      historyRes = { status: 0, body: {} };
    }
    assert(historyRes.status === 200, `Session history returned 200 (got ${historyRes.status})`);
    assert(Array.isArray(historyRes.body) || (historyRes.body && Array.isArray(historyRes.body.results)), 'Session history returns array or results object');

    log('Step 3: Query session history with similarity search...');
    let queryRes;
    try {
      queryRes = await request('GET', '/api/session-history?query=verification&limit=5');
    } catch (err) {
      log(`FAIL: Similarity query threw: ${err.message}`);
      queryRes = { status: 0, body: {} };
    }
      assert(queryRes.status === 200, `Similarity query returned 200 (got ${queryRes.status})`);
      assert(queryRes.body && (queryRes.body.mode === 'similarity' || Array.isArray(queryRes.body)), 'Similarity mode or array results present');

    log('Step 4: Verify health endpoint...');
    let healthRes;
    try {
      healthRes = await request('GET', '/health');
    } catch (err) {
      log(`FAIL: Health request threw: ${err.message}`);
      healthRes = { status: 0, body: {} };
    }
    assert(healthRes.status === 200 || healthRes.status === 503, `Health endpoint responded (${healthRes.status})`);
    assert(healthRes.body && healthRes.body.status === 'ok', `Health status is ok (got ${healthRes.body?.status})`);

    log('Step 5: Verify telemetry logs endpoint...');
    let logsRes;
    try {
      logsRes = await request('GET', '/api/telemetry/logs?limit=1');
    } catch (err) {
      log(`FAIL: Telemetry logs request threw: ${err.message}`);
      logsRes = { status: 0, body: {} };
    }
    assert(logsRes.status === 200, `Telemetry logs returned 200 (got ${logsRes.status})`);
    assert(Array.isArray(logsRes.body) || (logsRes.body && Array.isArray(logsRes.body.logs)), 'Telemetry logs returns array');

  } catch (err) {
    log(`FATAL: ${err.message}`);
    failed++;
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await sleep(1000);
    }
  }

  log('\n=== Verification Summary ===');
  log(`Passed: ${passed}`);
  log(`Failed: ${failed}`);
  log(`Result: ${failed === 0 ? 'PASS' : 'FAIL'}`);

  if (failed > 0) {
    log('\nTroubleshooting tips:');
    log('1. Ensure Redis is running: redis-server --daemonize yes');
    log('2. Check REDIS_URL environment variable');
    log('3. Verify SQLite database file is writable');
    log('4. Check server logs for detailed error messages');
  }

  process.exit(failed === 0 ? 0 : 1);
}

runVerification();
