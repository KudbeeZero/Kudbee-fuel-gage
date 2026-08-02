/**
 * services/ingestion/routes/thinkbox.ts
 *
 * THINKBOX API — serves workspace listing, detection, and intelligence
 * manifests to the Control Tower frontend. Mounted under /api/thinkbox.
 */

import express from 'express';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { publishThinkboxEvent } from '../../thinkbox/src/live/events.ts';

interface ThinkingDeps {
  runQuery: (sql: string, params?: unknown[]) => Promise<any[]>;
}

export function createThinkboxRouter(_deps: ThinkingDeps) {
  const router = express.Router();

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

  router.get('/provision/:workspaceId', (req, res) => {
    try {
      const { workspaceId } = req.params;
      const sim = req.query.sim !== '0';
      const simFlag = sim ? '' : ' --no-sim';
      const output = thinkboxCli(`provision ${workspaceId}${simFlag}`);
      if (!output) {
        return res.status(404).json({ error: 'Workspace not found or provisioning failed' });
      }

      const plan = JSON.parse(output);
      res.json(plan);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Provisioning failed' });
    }
  });

  router.post('/browser-event', (req, res) => {
    try {
      const { events } = req.body ?? {};
      if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'Expected events array' });
      }

      for (const ev of events) {
        publishThinkboxEvent({
          type: ev.type?.startsWith('ws:') ? 'browser:connected' :
                ev.type === 'page:error' || ev.type === 'console:error' ? 'browser:error' :
                'browser:action',
          workspaceId: null,
          data: ev,
          severity: ev.type?.includes('error') ? 'error' : 'info',
        });
      }

      res.json({ received: events.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to process browser events' });
    }
  });

  return router;
}
