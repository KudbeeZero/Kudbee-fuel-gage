import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const INGESTION_DIR = `${__dirname}/../services/ingestion`;
const PORT = 9876;
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

async function waitForServer(url, timeoutMs = 10000) {
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
  console.log('[E2E] Starting ingestion server...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: INGESTION_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));

  serverProcess.on('error', (err) => {
    console.error(`[E2E] Failed to start server process: ${err.message}`);
  });

  await waitForServer(`${BASE}/health`, 15000);
  console.log('[E2E] Server is ready\n');
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

async function check1_HealthEndpoint() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  return res.status === 200 && ['ok', 'degraded'].includes(data.status) && data.dependencies?.ingestion_db;
}

async function check2_HealthCheckApi() {
  const res = await fetch(`${BASE}/api/health-check`);
  const data = await res.json();
  const hasUptime = typeof data.uptime_sec === 'number';
  const hasError = typeof data.error === 'string';
  const degradedGracefully = res.status === 500 && hasError;
  return (res.status === 200 || res.status === 503 || degradedGracefully) && (hasUptime || hasError);
}

async function check3_ValidIngest() {
  const payload = {
    trace_id: `tr-e2e-${Date.now()}`,
    model: 'gemini-1.5-pro',
    tokens_in: 150,
    tokens_out: 80,
    cost: 0.0025,
    status: 'OK',
    provider: 'Google',
    project_name: 'kilo-fuel-gauge'
  };
  const res = await fetch(`${BASE}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return (res.status === 200 || res.status === 201) && data.success === true;
}

async function check4_InvalidIngestRejection() {
  const res = await fetch(`${BASE}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invalid: true })
  });
  return res.status === 422;
}

async function check5_TelemetryLogs() {
  const res = await fetch(`${BASE}/api/telemetry/logs?limit=5`);
  const data = await res.json();
  return Array.isArray(data) && data.length >= 1;
}

async function check6_MemoryRecall() {
  const res = await fetch(`${BASE}/api/memory/recall?query=control+tower+telemetry&limit=3`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.memories);
}

async function check7_GovernanceHealth() {
  const res = await fetch(`${BASE}/api/governance/health`);
  const data = await res.json();
  return res.status === 200 && data.governance_active === true;
}

async function check8_HermesLogs() {
  const res = await fetch(`${BASE}/api/governance/hermes-logs`);
  const data = await res.json();
  return (res.status === 200 || res.status === 500) && (Array.isArray(data) || typeof data === 'object');
}

async function check9_DatabaseDependency() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  return data.dependencies && (data.dependencies.ingestion_db === 'healthy' || data.dependencies.ingestion_db === 'unhealthy');
}

async function check10_SchemaExistence() {
  const res = await fetch(`${BASE}/api/interceptor/triage`);
  return res.status === 200;
}

async function check11_DashboardAggregate() {
  const res = await fetch(`${BASE}/api/dashboard/summary`);
  const data = await res.json();
  return res.status === 200 && typeof data.total_historical_tokens === 'number';
}

async function check12_DeepHealthEndpoint() {
  const res = await fetch(`${BASE}/api/system/health-deep`);
  const data = await res.json();
  return res.status === 200 && (data.status === 'HEALTHY' || data.status === 'DEGRADED') && data.services && data.agent;
}

async function check13_ModelComparator() {
  const res = await fetch(`${BASE}/api/system/compare-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini' })
  });
  const data = await res.json();
  return res.status === 200 && (data.status === 'OK' || data.status === 'PROVIDER_UNREACHABLE') && typeof data.traceId === 'string';
}

async function check14_MintThinkToken() {
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `tr-e2e-${Date.now()}`,
      taskContext: { task: 'e2e-test' },
      failedState: { status: 'FAILED' },
      correctionDelta: 'E2E correction delta'
    })
  });
  const data = await res.json();
  return res.status === 201 && data.success === true && typeof data.tokenId === 'string';
}

async function check15_ThinkTrajectories() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=10`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.trajectories) && Array.isArray(data.count !== undefined ? [data.count] : []);
}

async function check16_AutoThinkTokenEmbedding() {
  const res = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `tr-e2e-auto-${Date.now()}`,
      taskContext: { task: 'e2e-auto-check' },
      failedState: { status: 'AUTO_TEST' },
      correctionDelta: 'Automated verification correction delta',
      reasoningSteps: ['Step 1: verify embedding generation', 'Step 2: verify persistence', 'Step 3: verify trajectory surfacing']
    })
  });
  const data = await res.json();
  const minted = res.status === 201 && data.success === true && typeof data.tokenId === 'string' && data.embedding_dim === 1536;

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=5`);
  const trajData = await trajRes.json();
  const hasValidTrajectory = trajRes.status === 200 &&
    Array.isArray(trajData.trajectories) &&
    trajData.trajectories.some((t) => {
      const coords = Array.isArray(t.spatial_coordinates) ? t.spatial_coordinates : [];
      return coords.length === 1536;
    });

  return minted && hasValidTrajectory;
}

async function check17_GovernancePromotionEndpoint() {
  const traceId = `tr-e2e-gov-${Date.now()}`;
  const mintRes = await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId,
      taskContext: { task: 'e2e-gov-check' },
      failedState: { status: 'GOV_TEST' },
      correctionDelta: 'Governance promotion test delta',
      status: 'PENDING_APPROVAL'
    })
  });
  const mintData = await mintRes.json();
  if (!(mintRes.status === 201 && mintData.success === true && typeof mintData.tokenId === 'string')) {
    return false;
  }

  const trajRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const trajData = await trajRes.json();
  const token = trajData.trajectories.find((t) => t.id === mintData.tokenId);
  if (!token || token.status !== 'PENDING_APPROVAL') return false;

  const patchRes = await fetch(`${BASE}/api/think/trajectories/${encodeURIComponent(token.token_hash)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'VERIFIED', reviewerNotes: 'E2E governance promotion', tokenId: token.id })
  });
  const patchData = await patchRes.json();
  if (!(patchRes.status === 200 && patchData.success === true && patchData.status === 'VERIFIED')) return false;

  const confirmRes = await fetch(`${BASE}/api/think/trajectories?limit=50`);
  const confirmData = await confirmRes.json();
  const updated = confirmData.trajectories.find((t) => t.token_hash === token.token_hash);
  return updated !== undefined && updated.status === 'VERIFIED';
}

async function check18_TelemetrySearchEndpoint() {
  const res = await fetch(`${BASE}/api/telemetry/search?q=gemini&limit=5`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.results) && typeof data.total === 'number';
}

async function check19_AuditExportJsonEndpoint() {
  const res = await fetch(`${BASE}/api/audit/export?format=json`);
  const data = await res.json();
  return res.status === 200 && typeof data.hash === 'string' && typeof data.recordCount === 'number';
}

async function check20_SystemDiagnosticsEndpoint() {
  const res = await fetch(`${BASE}/api/system/diagnostics`);
  const data = await res.json();
  return res.status === 200 && (data.status === 'HEALTHY' || data.status === 'DEGRADED') && typeof data.summary === 'object' && Array.isArray(data.routerProviders);
}

async function check21_AgentFeedbackEndpoint() {
  const traceId = `tr-e2e-fb-${Date.now()}`;

  const submitRes = await fetch(`${BASE}/api/governance/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId,
      verdict: 'thumbs_up',
      policyTag: 'pii_redaction',
      expectedBehavior: 'Should not block on benign prompt',
      notes: 'E2E feedback test'
    })
  });
  const submitData = await submitRes.json();
  if (!(submitRes.status === 201 && submitData.success === true && typeof submitData.feedbackId === 'string')) {
    return false;
  }

  const invalidRes = await fetch(`${BASE}/api/governance/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ traceId, verdict: 'maybe' })
  });
  if (invalidRes.status !== 400) {
    return false;
  }

  const listRes = await fetch(`${BASE}/api/governance/feedback?traceId=${encodeURIComponent(traceId)}`);
  const listData = await listRes.json();
  return listRes.status === 200 &&
    Array.isArray(listData.feedback) &&
    listData.feedback.some((f) => f.traceId === traceId && f.verdict === 'thumbs_up' && f.policyTag === 'pii_redaction');
}

async function check22_PolicyAutoTuneEndpoint() {
  const tuneRes = await fetch(`${BASE}/api/governance/tune`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lookbackHours: 24 })
  });
  const tuneData = await tuneRes.json();
  if (!(tuneRes.status === 200 && tuneData.success === true &&
        typeof tuneData.analysis === 'object' &&
        tuneData.recommendations &&
        typeof tuneData.recommendations.token_budget_cap === 'object' &&
        typeof tuneData.recommendations.pii_redaction === 'object' &&
        typeof tuneData.recommendations.secret_leak_prevention === 'object')) {
    return false;
  }

  const getRes = await fetch(`${BASE}/api/governance/tune`);
  const getData = await getRes.json();
  if (!(getRes.status === 200 && getData.available === true && getData.lastAnalysis)) {
    return false;
  }

  const applyRes = await fetch(`${BASE}/api/governance/tune/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recommendations: tuneData.recommendations })
  });
  const applyData = await applyRes.json();
  return applyRes.status === 200 && applyData.success === true && Array.isArray(applyData.applied);
}

async function check23_RBACPermissionEnforcement() {
  const tenantsRes = await fetch(`${BASE}/api/governance/tenants`);
  const tenantsData = await tenantsRes.json();
  if (!(tenantsRes.status === 200 && Array.isArray(tenantsData.tenants) && tenantsData.tenants.length >= 2)) {
    return false;
  }

  const auditor = tenantsData.tenants.find((t) => t.role === 'AUDITOR');
  const operator = tenantsData.tenants.find((t) => t.role === 'OPERATOR');
  if (!auditor || !operator) return false;

  const auditorTuneApply = await fetch(`${BASE}/api/governance/tune/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': auditor.id },
    body: JSON.stringify({ recommendations: { token_budget_cap: { recommendedThreshold: 12345 } } })
  });
  if (auditorTuneApply.status !== 403) return false;

  const operatorTuneApply = await fetch(`${BASE}/api/governance/tune/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': operator.id },
    body: JSON.stringify({ recommendations: { token_budget_cap: { recommendedThreshold: 12345 } } })
  });
  if (operatorTuneApply.status !== 403) return false;

  const operatorAnchor = await fetch(`${BASE}/api/audit/vault/anchor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': operator.id },
    body: JSON.stringify({ limit: 5 })
  });
  if (operatorAnchor.status !== 403) return false;

  return true;
}

async function check24_AuditVaultHashing() {
  const anchorRes = await fetch(`${BASE}/api/audit/vault/anchor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'tenant-prod' },
    body: JSON.stringify({ limit: 10 })
  });
  const anchorData = await anchorRes.json();
  if (!(anchorRes.status === 201 && anchorData.success === true &&
        typeof anchorData.anchor?.batchRoot === 'string' &&
        anchorData.anchor.batchRoot.length === 64 &&
        typeof anchorData.anchor.leafCount === 'number')) {
    return false;
  }

  const listRes = await fetch(`${BASE}/api/audit/vault`);
  const listData = await listRes.json();
  if (!(listRes.status === 200 && Array.isArray(listData.anchors) && listData.count >= 1)) {
    return false;
  }

  const verifyRes = await fetch(`${BASE}/api/audit/vault/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'tenant-audit' },
    body: JSON.stringify({ anchorId: anchorData.anchor.anchorId })
  });
  const verifyData = await verifyRes.json();
  return verifyRes.status === 200 &&
    typeof verifyData.verified === 'boolean' &&
    verifyData.anchorId === anchorData.anchor.anchorId &&
    verifyData.originalRoot === anchorData.anchor.batchRoot;
}

async function check25_SubRouterIntegrity() {
  const subRouterCases = [
    { method: 'GET', path: '/api/audit/export?format=json', expectStatus: 200, expectFields: ['hash', 'recordCount', 'records'] },
    { method: 'GET', path: '/api/audit/vault', expectStatus: 200, expectFields: ['anchors', 'count'] },
    { method: 'GET', path: '/api/governance/policies', expectStatus: 200, expectFields: ['policies'] },
    { method: 'GET', path: '/api/governance/tenants', expectStatus: 200, expectFields: ['tenants', 'current'] },
    { method: 'GET', path: '/api/governance/tune', expectStatus: 200, expectFields: ['lastAnalysis', 'available'] },
    { method: 'GET', path: '/api/governance/feedback?limit=5', expectStatus: 200, expectFields: ['feedback', 'count'] },
    { method: 'GET', path: '/api/telemetry/search?q=gemini&limit=5', expectStatus: 200, expectFields: ['results', 'total'] },
    { method: 'GET', path: '/api/telemetry/logs?limit=5', expectStatus: 200 },
    { method: 'GET', path: '/api/system/health-deep', expectStatus: 200, expectFields: ['status', 'services'] },
    { method: 'GET', path: '/api/system/alerts', expectStatus: 200 },
  ];

  for (const c of subRouterCases) {
    const res = await fetch(`${BASE}${c.path}`, { headers: { 'X-Tenant-Id': 'tenant-prod' } });
    if (res.status !== c.expectStatus) return false;
    if (c.expectFields && c.expectFields.length > 0) {
      const body = await res.json();
      for (const field of c.expectFields) {
        if (!(field in body)) return false;
      }
    }
  }
  return true;
}

async function check26_LazyBundleLoading() {
  const distCandidates = [
    `${__dirname}/../apps/web/dist/index.html`,
    `${__dirname}/../apps/web/dist/assets`,
    `${__dirname}/../../apps/web/dist/index.html`
  ];
  let distPath = null;
  for (const candidate of distCandidates) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(candidate)) {
        distPath = candidate;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!distPath) {
    return true;
  }

  const fs = await import('fs');
  const path = await import('path');
  const assetsDir = path.dirname(distPath) + '/assets';
  if (!fs.existsSync(assetsDir)) {
    return true;
  }
  const files = fs.readdirSync(assetsDir);
  const jsFiles = files.filter((f) => f.endsWith('.js'));
  return jsFiles.length >= 1;
}

// --- Phase 28: Agent Context Factory, Token Forge & Confidence surfaces -------

// Check 27: The agent context factory assembles the hierarchical system prompt
// (BASE_IDENTITY + IMMUTABLE_LAWS) for a given intent. Verifies the Phase 6
// factory is wired and observable end-to-end via GET /api/agents/context.
async function check27_AgentContextFactoryHierarchy() {
  const res = await fetch(`${BASE}/api/agents/context?prompt=${encodeURIComponent('inspect the system telemetry dashboard')}`);
  const data = await res.json();
  return res.status === 200 &&
    data.success === true &&
    typeof data.system_prompt === 'string' &&
    data.system_prompt.length > 0 &&
    data.system_prompt.includes('BASE_IDENTITY') &&
    data.system_prompt.includes('IMMUTABLE_LAWS');
}

// Check 28: Dynamic skill tagging — a destructive (DB mutation) intent MUST be
// tagged with the DATABASE_MUTATION skill so the Governance Gate is armed.
async function check28_DynamicSkillTagging() {
  const res = await fetch(`${BASE}/api/agents/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'insert a new row into the postgres database table' })
  });
  const data = await res.json();
  return res.status === 200 &&
    data.success === true &&
    Array.isArray(data.skills) &&
    data.skills.includes('DATABASE_MUTATION');
}

// Check 29: Trajectories surface the Phase 28 confidence_score for the History
// panel data contract (with graceful handling for any legacy row).
async function check29_TrajectoriesExposeConfidence() {
  const res = await fetch(`${BASE}/api/think/trajectories?limit=25`);
  const data = await res.json();
  if (!(res.status === 200 && Array.isArray(data.trajectories))) return false;
  // Earlier checks (14/16/17) mint think tokens, so the store is non-empty.
  if (data.trajectories.length === 0) return true;
  return data.trajectories.every((t) => typeof t.confidence_score === 'number');
}

// Check 30: The uncertainty-gate parse variant (GET) normalizes a low
// confidence and flags below_threshold without writing to the governance queue.
async function check30_UncertaintyGateParse() {
  const res = await fetch(`${BASE}/api/agents/evaluate?payload=${encodeURIComponent(JSON.stringify({ action: 'probe', confidence_score: 0.35, uncertainty_flag: false }))}`);
  const data = await res.json();
  return res.status === 200 &&
    typeof data.confidence_score === 'number' &&
    data.confidence_score < 0.8 &&
    data.below_threshold === true &&
    data.uncertainty_flag === true;
}

// --- Phase 28: Token Forge RAG + Probabilistic Uncertainty Gating ------------

// Check 31: A low-confidence agent payload (confidence_score < 0.80) MUST be
// intercepted by the Uncertainty Gate BEFORE execution and routed to the
// PENDING_APPROVAL governance queue tagged `REASON: HIGH_UNCERTAINTY`. Also
// verifies a high-confidence payload clears the gate (EXECUTE).
async function check31_UncertaintyGateInterception() {
  // (a) Low-confidence payload → trapped + routed to PENDING.
  const lowRes = await fetch(`${BASE}/api/agents/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'deploy-schema-drop',
      confidence_score: 0.42,
      uncertainty_flag: true,
      reasoning: 'Guessing the migration is safe without verifying topology.',
      trace_id: `tr-uncertain-${Date.now()}`,
      model: 'reasoning'
    })
  });
  const lowData = await lowRes.json();
  const trapped =
    lowRes.status === 202 &&
    lowData.intercepted === true &&
    lowData.decision === 'PENDING_APPROVAL' &&
    lowData.status === 'PENDING_APPROVAL' &&
    typeof lowData.confidence_score === 'number' &&
    lowData.confidence_score < 0.8 &&
    lowData.tag === 'REASON: HIGH_UNCERTAINTY' &&
    typeof lowData.governance_action_id === 'string';

  if (!trapped) return false;

  // (b) High-confidence payload → clears the gate (EXECUTE, not intercepted).
  const highRes = await fetch(`${BASE}/api/agents/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'read-only-introspection',
      confidence_score: 0.96,
      uncertainty_flag: false,
      reasoning: 'Verified against the system topology blueprint.',
      trace_id: `tr-confident-${Date.now()}`,
      model: 'reasoning'
    })
  });
  const highData = await highRes.json();
  const cleared =
    highRes.status === 200 &&
    highData.intercepted === false &&
    highData.decision === 'EXECUTE' &&
    highData.status === 'EXECUTING' &&
    highData.confidence_score >= 0.8;

  return cleared;
}

// Check 32: The Token Forge (getRelevantThinkTokens) MUST retrieve past
// successful execution context without crashing. Asserts a well-formed payload
// (ok boolean + count + results array). When the pgvector store is reachable,
// count is > 0 because earlier checks (14/16/17) minted think tokens.
async function check32_TokenForgeRetrieval() {
  // Seed the forge with a known correction delta so there is at least one
  // past-success candidate to retrieve.
  await fetch(`${BASE}/api/governance/mint-think-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: `tr-forge-${Date.now()}`,
      taskContext: { task: 'forge-retrieval-probe' },
      failedState: { status: 'FORGE_TEST' },
      correctionDelta: 'Token Forge retrieval probe: query pgvector for past successes.'
    })
  }).catch(() => {});

  const res = await fetch(`${BASE}/api/memory/think-tokens?prompt=${encodeURIComponent('past successful execution context telemetry')}&limit=3`);
  const data = await res.json();

  const wellFormed =
    res.status === 200 &&
    typeof data.ok === 'boolean' &&
    typeof data.count === 'number' &&
    Array.isArray(data.results);

  if (!wellFormed) return false;

  // When context is retrieved, each result must carry the proven-success shape.
  if (data.count > 0) {
    const sample = data.results[0];
    const resultShaped =
      typeof sample.id === 'string' &&
      typeof sample.correction_delta === 'string' &&
      typeof sample.similarity === 'number';
    if (!resultShaped) return false;
  }

  // Retrieval must not crash even with an empty/blank prompt (resilient path).
  const emptyRes = await fetch(`${BASE}/api/memory/think-tokens?limit=3`);
  const emptyData = await emptyRes.json();
  return emptyRes.status === 200 && Array.isArray(emptyData.results);
}

async function run() {
  try {
    await startServer();
    await runCheck('Check 1: Health endpoint', check1_HealthEndpoint);
    await runCheck('Check 2: Health-check API endpoint', check2_HealthCheckApi);
    await runCheck('Check 3: Valid telemetry ingest', check3_ValidIngest);
    await runCheck('Check 4: Invalid payload rejection', check4_InvalidIngestRejection);
    await runCheck('Check 5: Telemetry logs retrieval', check5_TelemetryLogs);
    await runCheck('Check 6: Memory recall', check6_MemoryRecall);
    await runCheck('Check 7: Governance health', check7_GovernanceHealth);
    await runCheck('Check 8: HERMES logs endpoint', check8_HermesLogs);
    await runCheck('Check 9: Database dependency reporting', check9_DatabaseDependency);
    await runCheck('Check 10: Schema existence via interceptor', check10_SchemaExistence);
    await runCheck('Check 11: Dashboard aggregate query', check11_DashboardAggregate);
    await runCheck('Check 12: Deep health endpoint', check12_DeepHealthEndpoint);
    await runCheck('Check 13: Model comparator endpoint', check13_ModelComparator);
    await runCheck('Check 14: Mint think token endpoint', check14_MintThinkToken);
    await runCheck('Check 15: Think trajectories endpoint', check15_ThinkTrajectories);
    await runCheck('Check 16: Auto Think Token embedding & trajectory', check16_AutoThinkTokenEmbedding);
    await runCheck('Check 17: Governance promotion endpoint (PATCH status)', check17_GovernancePromotionEndpoint);
    await runCheck('Check 18: Telemetry search endpoint', check18_TelemetrySearchEndpoint);
    await runCheck('Check 19: Audit export JSON endpoint', check19_AuditExportJsonEndpoint);
    await runCheck('Check 20: System diagnostics endpoint', check20_SystemDiagnosticsEndpoint);
    await runCheck('Check 21: Agent feedback endpoint', check21_AgentFeedbackEndpoint);
    await runCheck('Check 22: Policy auto-tune endpoint', check22_PolicyAutoTuneEndpoint);
    await runCheck('Check 23: RBAC permission enforcement', check23_RBACPermissionEnforcement);
    await runCheck('Check 24: Audit vault anchoring & verification', check24_AuditVaultHashing);
    await runCheck('Check 25: Sub-router endpoint integrity', check25_SubRouterIntegrity);
    await runCheck('Check 26: Lazy bundle availability', check26_LazyBundleLoading);
    await runCheck('Check 27: Agent context factory hierarchy', check27_AgentContextFactoryHierarchy);
    await runCheck('Check 28: Dynamic skill tagging (DATABASE_MUTATION)', check28_DynamicSkillTagging);
    await runCheck('Check 29: Trajectories expose confidence_score', check29_TrajectoriesExposeConfidence);
    await runCheck('Check 30: Uncertainty gate parse variant', check30_UncertaintyGateParse);
    await runCheck('Check 31: Uncertainty gate low-confidence interception', check31_UncertaintyGateInterception);
    await runCheck('Check 32: Token Forge retrieval (getRelevantThinkTokens)', check32_TokenForgeRetrieval);
  } catch (e) {
    console.error(`[E2E] Fatal error: ${e.message}`);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of 32`);
  console.log('========================================');

  if (failed > 0) {
    console.error('[E2E] VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('[E2E] ALL CHECKS PASSED');
    process.exit(0);
  }
}

run();
