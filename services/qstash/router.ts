// services/qstash/router.ts
// ---------------------------------------------------------------------------
// External Logic Phase — QStash Agent Router
//
// Mount in services/ingestion/server.js:
//   import { qstashRouter } from '../qstash/router.ts';
//   app.use('/api/qstash', qstashRouter);
//
// Handles QStash-delivered agent tasks with signature verification.
// Replaces BRPOP-based agent dispatch from cloud-agent.mjs.
// ---------------------------------------------------------------------------

import { Router, json, type Request, type Response } from 'express';
import { verifyQStashMessage, type AgentTask } from './client.ts';

export const qstashRouter = Router();

// ── QStash signature verification middleware ───────────────────────────────

async function qstashAuth(req: Request, res: Response, next: () => void) {
  // DEV mode: skip verification
  if (process.env.QSTASH_DEV === 'true') return next();

  const signature = req.headers['upstash-signature'] as string | undefined;
  if (!signature) {
    return res.status(401).json({ error: 'Missing Upstash-Signature header' });
  }

  const rawBody = JSON.stringify(req.body);
  const valid = await verifyQStashMessage(signature, rawBody);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid QStash signature' });
  }

  next();
}

qstashRouter.use(json());

// ── Agent task dispatch ────────────────────────────────────────────────────

// POST /api/qstash/agents/:agentId/task
// QStash delivers agent task payloads here for delegated execution.
// The agent system (services/agents/) picks up the task and processes it.
qstashRouter.post('/agents/:agentId/task', qstashAuth, async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const task = req.body as AgentTask;

  // This endpoint receives tasks delegated by QStash from dispatchAgentTask().
  // The actual agent execution is handled by the agent subsystem.
  // For now, acknowledge receipt; Phase 2 wires the execution engine.

  console.log(`[qstash] task received: agent=${agentId} task=${task.task} id=${task.timestamp}`);

  res.json({
    received: true,
    agentId,
    task: task.task,
    timestamp: new Date().toISOString(),
  });
});

// ── Swarm broadcast ────────────────────────────────────────────────────────

// POST /api/qstash/agents/broadcast
// Receives swarm-wide broadcasts relayed through QStash.
qstashRouter.post('/agents/broadcast', qstashAuth, async (req: Request, res: Response) => {
  const { topic, content, priority } = req.body as {
    topic: string;
    content: string;
    priority?: string;
  };

  console.log(`[qstash] broadcast: topic=${topic} priority=${priority ?? 'normal'} content=${content.slice(0, 80)}`);

  res.json({
    received: true,
    topic,
    timestamp: new Date().toISOString(),
  });
});

// ── Health ─────────────────────────────────────────────────────────────────

qstashRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'qstash', timestamp: new Date().toISOString() });
});
