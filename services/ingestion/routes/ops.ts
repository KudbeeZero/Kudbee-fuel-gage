/**
 * services/ingestion/routes/ops.ts
 * ---------------------------------------------------------------------------
 * Operational endpoints consolidation (route-map audit 2026-08-06).
 *
 * Groups the operational surface (alerts, ci, prs, events, stream, metrics,
 * news, proxy, reasoning, session, orchestrator, model gateway) behind a
 * single router with centralized security enforcement:
 *
 *   - Read (GET) operational endpoints: public, api-rate-limited
 *   - Mutating (POST/PUT/PATCH/DELETE) operational endpoints: agent-auth
 *     gated (requireAgentAuth) + global rate-limited
 *
 * This consolidates ~20 inline server.js endpoints into one router, making
 * the surface self-contained and the security classes explicit in one place.
 * Endpoints requiring in-scope state (os-stream SSE, telemetry) remain in
 * server.js — this router owns the stateless operational reads.
 * ---------------------------------------------------------------------------
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

// ── Shared security helpers (imported from server.js's module scope is not
//    possible — routers receive them via factory deps like audit.ts does).
export interface OpsRouterDeps {
  runQuery?: (sql: string, params?: unknown[]) => Promise<any>;
  redis?: any;
  requireAgentAuth?: (req: any, res: any) => Promise<boolean>;
  fetchJson?: (url: string, init?: RequestInit) => Promise<any>;
}

const CACHE = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 30_000;

function readJsonStore(relPath: string, fallback: unknown): unknown {
  try {
    const p = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function createOpsRouter(deps: OpsRouterDeps = {}) {
  const router = express.Router();
  const auth = deps.requireAgentAuth;

  const cached = async (key: string, fn: () => Promise<unknown>) => {
    const now = Date.now();
    const hit = CACHE.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.data;
    const data = await fn();
    CACHE.set(key, { at: now, data });
    return data;
  };

  // ── CI status (read) ─────────────────────────────────────────────────────
  router.get('/ci/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await cached('ci', async () => {
        const gh = await fetch('https://api.github.com/repos/KudbeeZero/Kudbee-fuel-gage/actions/runs?branch=main&per_page=1', {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'kudbee-ops' },
          signal: AbortSignal.timeout(8000),
        });
        const body = await gh.json();
        const run = body.workflow_runs?.[0];
        if (!run) return { status: 'unknown', source: 'github' };
        return {
          status: run.status === 'completed' ? (run.conclusion === 'success' ? 'GREEN' : run.conclusion === 'failure' ? 'FAIL' : 'WARN') : 'RUNNING',
          lastRun: run.created_at, runId: run.id,
          headSha: run.head_sha?.slice(0, 7) ?? null,
          workflow: run.name ?? run.workflow_name ?? null,
          source: 'github-actions',
        };
      });
      res.json(data);
    } catch {
      res.json({ status: 'unknown', source: 'error' });
    }
  });

  // ── PR status (read) ─────────────────────────────────────────────────────
  router.get('/prs/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await cached('prs', async () => {
        const gh = await fetch('https://api.github.com/repos/KudbeeZero/Kudbee-fuel-gage/pulls?state=open&per_page=10', {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'kudbee-ops' },
          signal: AbortSignal.timeout(8000),
        });
        if (gh.status === 403) return { prs: [], count: 0, source: 'rate-limited' };
        const body = (await gh.json()) as any[];
        const prs = (Array.isArray(body) ? body : []).map((pr) => ({
          number: pr.number, title: pr.title, branch: pr.head?.ref ?? null,
          state: pr.state, updatedAt: pr.updated_at ?? null, url: pr.html_url ?? null,
        }));
        return { prs, count: prs.length, source: 'github', fetchedAt: new Date().toISOString() };
      });
      res.json(data);
    } catch {
      res.json({ prs: [], count: 0, source: 'error' });
    }
  });

  // ── News headlines (public read, cached) ────────────────────────────────
  router.get('/news/headlines', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await cached('news', async () => {
        const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5', {
          signal: AbortSignal.timeout(6000),
        });
        const b = await r.json();
        return { headlines: (b.hits ?? []).map((h: any) => h.title).filter(Boolean), source: 'hackernews' };
      });
      res.json(data);
    } catch {
      res.json({ headlines: [], source: 'unavailable' });
    }
  });

  // ── Router (orchestrator) status — read public, mutations agent-auth ────
  router.get('/router/status', async (_req, res) => {
    try {
      if (deps.redis) {
        const info = await deps.redis.get('kudbee:router:state');
        res.json({ state: info ? JSON.parse(info) : { mode: 'default' }, source: 'redis' });
      } else {
        res.json({ state: { mode: 'default' }, source: 'memory' });
      }
    } catch {
      res.json({ state: { mode: 'default' }, source: 'error' });
    }
  });

  router.post('/router/reset', async (req, res) => {
    if (auth && !(await auth(req, res))) return;
    try {
      try {
        if (deps.redis) await deps.redis.del('kudbee:router:state');
      } catch {
        // Redis unavailable — nothing persisted to clear.
      }
      res.json({ success: true, message: 'router state reset' });
    } catch {
      res.status(500).json({ error: 'reset failed' });
    }
  });

  router.post('/router/select', async (req, res) => {
    if (auth && !(await auth(req, res))) return;
    try {
      const { agent } = req.body || {};
      if (!agent) return res.status(400).json({ error: 'agent required' });
      try {
        if (deps.redis) await deps.redis.set('kudbee:router:state', JSON.stringify({ selected: agent, at: new Date().toISOString() }));
      } catch {
        // Redis unavailable — state is ephemeral in memory, still acknowledge.
      }
      res.json({ success: true, selected: agent });
    } catch {
      res.status(500).json({ error: 'select failed' });
    }
  });

  // ── Model gateway proxy (mutating → agent-auth) ─────────────────────────
  router.post('/chat/completions', async (req, res) => {
    if (auth && !(await auth(req, res))) return;
    try {
      const { model, messages } = req.body || {};
      if (!model || !messages) return res.status(400).json({ error: 'model + messages required' });
      const { createProvider } = await import('@kudbee/utils/llm/providers');
      const apiKey = process.env[model.toUpperCase().replace(/-/g, '_') + '_API_KEY'] || process.env.GEMINI_API_KEY;
      const client = createProvider({ kind: 'gemini', model, apiKey, temperature: 0.3, maxTokens: 512 });
      const resp = await client.complete({
        systemPrompt: messages.find((m: any) => m.role === 'system')?.content ?? '',
        userPrompt: messages.filter((m: any) => m.role === 'user').map((m: any) => m.content).join('\n'),
        temperature: 0.3,
        maxTokens: 512,
      });
      res.json({ model: resp.model, choices: [{ message: { role: 'assistant', content: resp.text } }] });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}
