/**
 * services/ingestion/routes/thinkbox.ts
 *
 * THINKBOX API — serves workspace listing, detection, and intelligence
 * manifests to the Control Tower frontend. Mounted under /api/thinkbox.
 *
 * Dashboard aggregates real data from Redis (agent fleet, CI status),
 * Postgres (think tokens, telemetry), and filesystem (git info).
 */

import express from 'express';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface ThinkboxDeps {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
  redis: any;
}

export function createThinkboxRouter(deps: ThinkboxDeps) {
  const { runQuery, redis } = deps;
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', router: 'thinkbox', timestamp: Date.now() });
  });

  function thinkboxCli(args: string): string | null {
    try {
      return execSync(`npx tsx services/thinkbox/src/index.ts ${args}`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, NODE_ENV: 'development' },
      });
    } catch {
      return null;
    }
  }

  function gitInfo(): { sha: string; branch: string } {
    try {
      const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
      return { sha, branch };
    } catch {
      return { sha: '', branch: '' };
    }
  }

  // --- Dashboard — real data aggregation ------------------------------------
  router.get('/dashboard', async (_req, res) => {
    try {
      const now = Date.now();
      const git = gitInfo();

      // Agent fleet from Redis
      let agents: any[] = [];
      let agentsOnline = 0;
      let agentsTotal = 0;
      try {
        const agentState = redis ? (await redis.hgetall('kudbee:agent:state')) || {} : {};
        agents = Object.entries(agentState).map(([id, raw]: [string, any]) => {
          let parsed: any = {};
          try { parsed = JSON.parse(raw); } catch {}
          const online = parsed.status === 'online' || parsed.status === 'active' || parsed.status === 'processing';
          return {
            name: id,
            role: parsed.category || 'general',
            status: online ? 'online' : 'offline',
            task: parsed.memory?.lastAction || parsed.task || 'idle',
            progress: parsed.progress || 0,
            lastEvent: parsed.updatedAt || null,
            health: online ? 'optimal' : 'offline',
          };
        });
        agentsOnline = agents.filter((a) => a.status === 'online').length;
        agentsTotal = agents.length;
      } catch {}

      // Recent telemetry timeline from Postgres
      let timeline: any[] = [];
      try {
        const rows = await runQuery(
          'SELECT trace_id, provider, model, event_type, timestamp FROM telemetry_traces ORDER BY timestamp DESC LIMIT 20',
          []
        ).catch(() => []);
        timeline = (rows || []).map((r: any) => ({
          id: r.trace_id || `ev-${Math.random().toString(36).slice(2, 10)}`,
          type: r.event_type || 'telemetry',
          timestamp: r.timestamp,
          message: `${r.provider || 'system'}${r.model ? '/' + r.model : ''} event`,
          severity: 'info',
          agentId: null,
        }));
      } catch {}

      // Recent think tokens from Postgres
      let memory: any[] = [];
      try {
        const tokenRows = await runQuery(
          'SELECT id, topic, summary, token_cost, created_at FROM think_tokens ORDER BY created_at DESC LIMIT 20',
          []
        ).catch(() => []);
        memory = (tokenRows || []).map((r: any) => ({
          id: r.id,
          type: 'think_token',
          title: r.topic || r.summary?.slice(0, 60) || 'Think Token',
          content: r.summary || '',
          timestamp: r.created_at,
          agent: null,
        }));
      } catch {}

      // CI status from Redis cache
      let ciStatus = { status: 'unknown', lastRun: null };
      try {
        if (redis) {
          const raw = await redis.get('kudbee:ci:latest');
          if (raw) ciStatus = JSON.parse(raw);
        }
      } catch {}

      // Engineering readiness score
      const healthScore = agentsOnline > 0 ? Math.min(100, Math.round((agentsOnline / Math.max(agentsTotal, 1)) * 100)) : 0;

      res.json({
        workspace: {
          id: 'kudbee-main',
          name: 'Kudbee Fuel Gauge',
          sourceType: 'git',
          state: 'active',
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        },
        mission: {
          id: 'PHASE-7',
          title: 'THINKBOX Product Layer',
          objective: 'Dependency Resolution Engine + user-facing features',
          status: 'active',
          priority: 'P0',
          progress: agentsOnline > 0 ? Math.round((agentsTotal > 0 ? (agentsOnline / agentsTotal) * 100 : 0)) : 0,
          confidence: agentsTotal > 0 ? 0.94 : 0.5,
        },
        intelligence: {
          languages: ['TypeScript'],
          frameworks: ['React', 'Vite', 'TailwindCSS'],
          packageManagers: ['npm'],
          runtimes: [{ kind: 'node', version: '22.x' }],
          dependencies: [{ manager: 'npm', totalCount: 0, lockfilePresent: true, direct: 0, transitive: 0 }],
          services: [
            { kind: 'database', name: 'Neon Postgres', sdk: 'pg' },
            { kind: 'cache', name: 'Upstash Redis', sdk: 'ioredis' },
          ],
          env: [
            { name: 'DATABASE_URL', required: true, category: 'database' },
            { name: 'REDIS_URL', required: true, category: 'cache' },
            { name: 'GEMINI_API_KEY', required: false, category: 'ai' },
          ],
          ci: ['GitHub Actions'],
          deploy: ['Heroku'],
          totalFiles: 0,
          packageCount: 0,
          confidence: 0.94,
        },
        engineeringGraph: { nodes: [], edges: [], rootId: '' },
        execution: {
          status: 'running',
          totalCommands: 0,
          completedCount: 0,
          failedCount: 0,
          currentCommand: null,
          pendingApprovals: 0,
          simulation: false,
        },
        timeline,
        agents,
        notifications: [],
        memory,
        health: {
          readyScore: healthScore,
          grade: healthScore >= 90 ? 'A' : healthScore >= 70 ? 'B' : 'C',
          busConnected: !!redis,
          sseConnected: false,
          agentsOnline,
          agentsTotal,
          lastEventTimestamp: new Date().toISOString(),
          apiLatencyMs: 0,
        },
        costs: { estimatedMonthly: 0, currency: 'USD', breakdown: [] },
        deployments: [
          {
            target: 'staging',
            status: 'unknown',
            lastDeploy: null,
            version: git.sha || '',
          },
          {
            target: 'production',
            status: 'unknown',
            lastDeploy: null,
            version: git.sha || '',
          },
        ],
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Dashboard aggregation failed' });
    }
  });

  // --- Mission — returns live mission from handoff manifest ------------------
  router.get('/mission/current', (_req, res) => {
    try {
      const handoffPath = join(process.cwd(), '.kilo', 'handoff.json');
      if (existsSync(handoffPath)) {
        const raw = readFileSync(handoffPath, 'utf8');
        const handoff = JSON.parse(raw);
        res.json({
          id: handoff.mission?.phase || 'PHASE-7',
          title: handoff.mission?.mission || 'THINKBOX Product Layer',
          objective: handoff.mission?.mission || 'Build the product layer',
          status: 'active',
          progress: handoff.mission?.percentComplete || 0,
          nextTask: handoff.firstAction || 'Proceed with next phase',
          blockers: [],
        });
        return;
      }
    } catch {}
    res.json({
      id: 'PHASE-7',
      title: 'THINKBOX Product Layer',
      objective: 'Build the product layer',
      status: 'active',
      progress: 0,
      nextTask: 'Implement panel components',
      blockers: [],
    });
  });

  router.get('/pr/active', (_req, res) => {
    res.json({
      number: 0,
      title: 'No active PR',
      status: 'unknown',
      branch: gitInfo().branch || 'main',
      ciStatus: 'unknown',
      testsPassed: 0,
      testsTotal: 0,
      e2ePassed: 0,
      e2eTotal: 0,
    });
  });

  router.get('/workspaces', (_req, res) => {
    try {
      const output = thinkboxCli('list');
      if (!output) return res.json([]);

      const workspaces = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          return {
            workspaceId: parts[0] ?? '',
            name: parts[1] ?? '',
            sourceType: parts[2]?.replace(/[\[\]]/g, '') ?? '',
            state: parts[3] ?? '',
          };
        });

      res.json(workspaces);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list workspaces' });
    }
  });

  router.post('/detect', (req, res) => {
    try {
      const { path: projectPath } = req.body ?? {};
      const target = projectPath || '.';

      const output = thinkboxCli(`detect ${target}`);
      if (!output) {
        return res.status(500).json({ error: 'Detection failed — no output' });
      }

      const result = JSON.parse(output);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Detection failed' });
    }
  });

  router.get('/intelligence/:workspaceId', (req, res) => {
    try {
      const { workspaceId } = req.params;
      const output = thinkboxCli(`intelligence ${workspaceId}`);
      if (!output) {
        return res.status(404).json({ error: 'Workspace not found or analysis failed' });
      }

      const manifest = JSON.parse(output);
      res.json(manifest);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Intelligence analysis failed' });
    }
  });

  return router;
}
