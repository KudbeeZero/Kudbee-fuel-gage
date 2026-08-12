// services/ingestion/routes/systemRead.ts
// ---------------------------------------------------------------------------
// Read-only system surfaces: knowledge graph, forge tokens, decision ledger,
// intelligence index, mission queue, lifecycle funnel, guardian status, and
// the phone system (call log, phone tree, voicemails, dthink).
//
// Every handler reads JSON files under `.kilo/**` (or benchmarks/**) and never
// mutates state. Extracted from the monolithic server.js to shrink the boot
// surface and isolate a domain that has zero DB/Redis/provider coupling.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..'); // services/ingestion/routes -> repo root

function readJsonStore(relPath, fallback) {
  try {
    const p = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const LIFECYCLE_STAGES = ['PROPOSED', 'APPROVED', 'BRANCH_CREATED', 'IMPLEMENTING', 'VERIFYING', 'READY_FOR_PR', 'MERGED', 'OBSERVING', 'COMPLETE'];

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Knowledge graph (full view with ?full=1, counts otherwise)
router.get('/api/system/knowledge-graph', (req, res) => {
  const g = readJsonStore('.kilo/knowledge-graph.json', { nodes: [], edges: [] });
  if (req.query?.full === '1') {
    res.json({ nodes: g.nodes ?? [], edges: g.edges ?? [], source: 'knowledge-graph' });
  } else {
    res.json({ nodes: g.nodes?.length ?? 0, edges: g.edges?.length ?? 0, source: 'knowledge-graph' });
  }
});

// THINK token cloud (full forge data for 3D visualization)
router.get('/api/system/forge-tokens', (_req, res) => {
  const dir = path.join(REPO_ROOT, '.kilo', 'memory', 'forge');
  const tokens = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('think-') && x.endsWith('.json'))) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        tokens.push({
          id: t.traceId ?? f.replace(/^think-/, '').replace(/\.json$/, ''),
          kd: t.kd ?? 50,
          status: t.status ?? 'UNKNOWN',
          keywords: t.keywords ?? [],
          createdAt: t.createdAt ?? null,
        });
      } catch {}
    }
  } catch {}
  tokens.sort((a, b) => (b.kd ?? 0) - (a.kd ?? 0));
  res.json({ tokens, count: tokens.length, source: 'forge' });
});

// Decision ledger
router.get('/api/system/decision-ledger', (_req, res) => {
  const d = readJsonStore('benchmarks/decisions/ledger.json', { decisions: [] });
  res.json({ decisions: d.decisions ?? [], source: 'decision-ledger' });
});

// Intelligence index (last day summary)
router.get('/api/system/intelligence-index', (_req, res) => {
  const idx = readJsonStore('.kilo/intelligence-index.json', { days: [] });
  const last = idx.days?.[idx.days.length - 1] ?? null;
  res.json({
    overall: last?.overall ?? 0,
    categories: last?.categories ?? { outcome: 0, knowledge: 0, operational: 0 },
    recommendation: last?.recommendation ?? null,
    source: 'intelligence-index',
  });
});

// Mission queue
router.get('/api/system/mission-queue', (_req, res) => {
  const q = readJsonStore('.kilo/mission-queue.json', { missions: [] });
  res.json({ missions: q.missions ?? [], source: 'mission-queue' });
});

// Agent lifecycle funnel
router.get('/api/system/funnel', (_req, res) => {
  const history = readJsonStore('.kilo/mission-history.json', { missions: [] });
  const queue = readJsonStore('.kilo/mission-queue.json', { missions: [] });
  const missions = (history.missions ?? []).concat(
    (queue.missions ?? []).map((q) => ({
      mission: q.id,
      state: q.state ?? 'PROPOSED',
      priority: q.priority,
      title: q.title,
      transitions: [],
    }))
  );
  const stages = LIFECYCLE_STAGES.map((stage) => ({
    stage,
    count: missions.filter((m) => (m.state ?? '').toUpperCase() === stage).length,
  }));
  const active = missions
    .filter((m) => (m.state ?? '').toUpperCase() !== 'COMPLETE')
    .map((m) => ({
      id: m.mission ?? m.id,
      state: (m.state ?? 'PROPOSED').toUpperCase(),
      priority: m.priority ?? null,
      title: m.title ?? null,
      lastTransition: m.transitions?.length ? m.transitions[m.transitions.length - 1] : null,
    }));
  res.json({
    stages,
    active,
    total: missions.length,
    funnel: LIFECYCLE_STAGES.filter((s) => missions.some((m) => (m.state ?? '').toUpperCase() === s)),
    generatedAt: new Date().toISOString(),
    source: 'mission-history',
  });
});

// Guardian status
router.get('/api/system/guardian-status', (_req, res) => {
  const g = readJsonStore('.kilo/guardian-last.json', { checks: {} });
  res.json({ checks: g.checks ?? {}, source: 'guardian' });
});

// --- Phone system (interactive calls, read-only) ---
router.get('/api/system/calls', (_req, res) => {
  const c = readJsonStore('.kilo/memory/call-log.json', { calls: [] });
  res.json({ calls: c.calls ?? [], total: c.totalCalls ?? (c.calls ?? []).length, source: 'call-log' });
});

router.get('/api/system/phone-tree', (_req, res) => {
  const t = readJsonStore('.kilo/memory/phone-tree.json', {});
  res.json({ tree: t, source: 'phone-tree' });
});

router.get('/api/system/voicemails', (_req, res) => {
  const dir = path.join(REPO_ROOT, '.kilo', 'memory', 'voicemails');
  const vms = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (Array.isArray(d)) vms.push(...d);
        else vms.push(d);
      } catch {}
    }
  } catch {}
  vms.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  res.json({ voicemails: vms, count: vms.length, source: 'voicemails' });
});

router.get('/api/system/dthink', (_req, res) => {
  const d = readJsonStore('.kilo/memory/dthink/index.json', { entries: [] });
  res.json({ entries: d.entries ?? [], source: 'dthink' });
});

export default router;
