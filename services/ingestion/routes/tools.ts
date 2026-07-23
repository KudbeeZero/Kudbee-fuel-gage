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
import { execSync } from 'child_process';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/teamspace/studios/this_studio';

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

  // POST /fs/read — reads a file from workspace
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

  // POST /shell/exec — executes a shell command
  router.post('/shell/exec', async (req, res) => {
    try {
      const command = req.body?.command;
      const cwdRaw = req.body?.cwd;

      if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "command" field.' });
      }

      let validatedCwd = WORKSPACE_ROOT;
      if (cwdRaw && typeof cwdRaw === 'string') {
        try {
          validatedCwd = validateWorkspacePath(cwdRaw);
        } catch (err: any) {
          return res.status(err.status ?? 500).json({ error: err.message });
        }
      }

      const stdout = execSync(command, {
        cwd: validatedCwd,
        timeout: 30_000,
        encoding: 'utf-8',
      });

      return res.json({ stdout, stderr: '', exitCode: 0 });
    } catch (err: any) {
      // execSync throws on non-zero exit or timeout
      return res.json({
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
        exitCode: err.status ?? 1,
      });
    }
  });

  return router;
}
