/**
 * services/ingestion/routes/tools.ts
 * ---------------------------------------------------------------------------
 * Workspace tool endpoints for the KUDBEE Terminal agentic loop.
 * All file-system operations are sandboxed to WORKSPACE_ROOT.
 *
 * Endpoints:
 *   POST /fs/read     — read a file from workspace
 *   POST /fs/write    — write a file to workspace
 *   POST /fs/list     — list directory contents
 *   POST /shell/exec  — execute a shell command
 * ---------------------------------------------------------------------------
 */

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

// SEC hardening (route-map audit 2026-08-06):
//   - WORKSPACE_ROOT resolves to the repo root (Heroku cwd), not a studio path.
//   - shell/exec requires AGENT_PASS (agent-auth) and ONLY runs allowlisted
//     commands — arbitrary shell execution is never public.
//   - fs/read + fs/write are agent-auth gated; traversal sandbox retained.
const execFileP = promisify(execFile);

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

// Allowlisted commands for shell/exec. Anything else → 403.
// Only read-only inspection commands are permitted; writes go through /fs/write.
const SHELL_ALLOWLIST: Array<{ cmd: string; args?: string[]; note: string }> = [
  { cmd: 'git', args: ['status', '--short'], note: 'git status' },
  { cmd: 'git', args: ['log', '--oneline', '-10'], note: 'git log' },
  { cmd: 'ls', args: ['-la'], note: 'directory listing' },
  { cmd: 'pwd', note: 'print working directory' },
  { cmd: 'node', args: ['--version'], note: 'node version' },
];

// Agent-auth gate: requires a valid X-Agent-Pass when auth is provisioned.
async function requireAgent(req: any, res: any, next: () => void) {
  if (!process.env.AGENT_REGISTRY_PATH) return next(); // Mode A — single-user
  try {
    const { authenticateAgentPass } = await import('../lib/bearerAuthMiddleware.ts');
    const agentId = authenticateAgentPass(req.header('X-Agent-Pass'));
    if (!agentId) return res.status(403).json({ error: 'forbidden', message: 'agent-auth required for tool endpoints' });
    (req as any).agentId = agentId;
    return next();
  } catch {
    return res.status(403).json({ error: 'forbidden', message: 'agent-auth unavailable' });
  }
}

// ---------------------------------------------------------------------------
// 1. PATH SANDBOX
// ---------------------------------------------------------------------------
function validateWorkspacePath(requestedPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, requestedPath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw { status: 403, message: `Path traversal denied: "${requestedPath}" escapes workspace root.` };
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// 2. ROUTER
// ---------------------------------------------------------------------------
export function createToolsRouter() {
  const router = express.Router();

  // All tool endpoints are agent-auth gated (production grade).
  router.use(requireAgent);

  // POST /fs/read — reads a file from workspace
  // CodeQL [js/missing-rate-limiting] suppressed: tool endpoint is for internal workspace operations.
  router.post('/fs/read', async (req, res) => {
    try {
      const requestedPath = req.body?.path;
      if (!requestedPath || typeof requestedPath !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "path" field.' });
      }

      let resolved: string;
      try {
        resolved = validateWorkspacePath(requestedPath);
      } catch (err: any) {
        return res.status(err.status ?? 500).json({ error: err.message });
      }

      const content = await fs.readFile(resolved, 'utf-8');
      return res.json({ content });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `File not found: ${req.body?.path}` });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /fs/write — writes a file to workspace
  // CodeQL [js/missing-rate-limiting] suppressed: tool endpoint is for internal workspace operations.
  router.post('/fs/write', async (req, res) => {
    try {
      const requestedPath = req.body?.path;
      const content = req.body?.content;
      if (!requestedPath || typeof requestedPath !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "path" field.' });
      }
      if (content === undefined || content === null) {
        return res.status(400).json({ error: 'Missing "content" field.' });
      }

      let resolved: string;
      try {
        resolved = validateWorkspacePath(requestedPath);
      } catch (err: any) {
        return res.status(err.status ?? 500).json({ error: err.message });
      }

      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, String(content), 'utf-8');
      return res.json({ success: true, path: requestedPath });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /fs/list — lists directory contents
  // CodeQL [js/missing-rate-limiting] suppressed: tool endpoint is for internal workspace operations.
  router.post('/fs/list', async (req, res) => {
    try {
      const requestedPath = req.body?.path || '.';
      if (typeof requestedPath !== 'string') {
        return res.status(400).json({ error: 'Invalid "path" field.' });
      }

      let resolved: string;
      try {
        resolved = validateWorkspacePath(requestedPath);
      } catch (err: any) {
        return res.status(err.status ?? 500).json({ error: err.message });
      }

      const entries = await fs.readdir(resolved);
      return res.json({ entries });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `Directory not found: ${req.body?.path || '.'}` });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /shell/exec — allowlisted read-only commands only (agent-auth).
  // Arbitrary shell execution is NOT exposed. execFile avoids shell
  // interpolation (no command injection via args).
  router.post('/shell/exec', async (req, res) => {
    try {
      const command = req.body?.command;
      if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "command" field.' });
      }

      // Normalize: strip leading slash/dirs, split into command + args.
      const parts = command.trim().split(/\s+/);
      const bin = parts[0] || '';
      const args = parts.slice(1);

      const allowed = SHELL_ALLOWLIST.find((e) => e.cmd === bin);
      if (!allowed) {
        return res.status(403).json({
          error: 'forbidden',
          message: `Command "${bin}" is not allowlisted. Read-only inspection commands only.`,
          allowed: SHELL_ALLOWLIST.map((e) => e.cmd),
        });
      }
      // Extra args beyond the allowlisted ones are rejected.
      if (allowed.args && args.join(' ') !== allowed.args.join(' ')) {
        return res.status(403).json({ error: 'forbidden', message: `Only the allowlisted invocation is permitted: ${allowed.cmd} ${(allowed.args || []).join(' ')}` });
      }

      let validatedCwd = WORKSPACE_ROOT;
      const cwdRaw = req.body?.cwd;
      if (cwdRaw && typeof cwdRaw === 'string') {
        try {
          validatedCwd = validateWorkspacePath(cwdRaw);
        } catch (err: any) {
          return res.status(err.status ?? 500).json({ error: err.message });
        }
      }

      const { stdout } = await execFileP(allowed.cmd, allowed.args || [], {
        cwd: validatedCwd,
        timeout: 15_000,
        encoding: 'utf-8',
      });

      return res.json({ stdout, stderr: '', exitCode: 0 });
    } catch (err: any) {
      return res.json({
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
        exitCode: err.code === 'ETIMEDOUT' ? 124 : (err.status ?? 1),
      });
    }
  });

  return router;
}
