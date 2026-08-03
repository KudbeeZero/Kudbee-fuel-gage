// services/qstash/workflow.ts
// ---------------------------------------------------------------------------
// External Logic Phase — Agent Dispatch Workflow Orchestration
//
// Uses @upstash/workflow for durable multi-step agent task execution:
// 1. context.run() — execute a step with guaranteed delivery
// 2. context.waitForEvent() — wait for agent completion signal  
// 3. context.notify() — broadcast results to subscribers
// 4. context.sleepUntil() — scheduled checkpointing
//
// This replaces the BRPOP-based governance worker + phone-tree ring pattern
// with event-driven durable workflows that survive dyno restarts.
// ---------------------------------------------------------------------------

import { serve } from '@upstash/workflow';
import { dispatchAgentTask, verifyQStashMessage } from './client.ts';

// ── Agent Task Dispatch Workflow ────────────────────────────────────────────

interface AgentDispatchInput {
  agentId: string;
  task: string;
  metadata?: Record<string, string>;
}

export const agentDispatchWorkflow = serve(async (context) => {
  // Step 1: Parse input
  const input = context.request.body as AgentDispatchInput;
  if (!input.agentId || !input.task) {
    return context.response.json(400, { error: 'Missing agentId or task' });
  }

  // Step 2: Dispatch the task via QStash (guaranteed delivery)
  const messageId = await context.run('dispatch', async () => {
    return await dispatchAgentTask({
      agentId: input.agentId,
      task: input.task,
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    });
  });

  // Step 3: Wait for agent completion (with timeout)
  const result = await context.waitForEvent<{ status: string; output?: unknown }>(
    `agent:${input.agentId}:done`,
    { timeout: 300_000 } // 5 min timeout
  );

  // Step 4: Notify subscribers
  await context.notify(`workflow:agent-dispatch:complete`, {
    agentId: input.agentId,
    messageId,
    result: result?.data,
    completedAt: new Date().toISOString(),
  });

  return context.response.json(200, {
    success: true,
    messageId,
    agentResult: result?.data,
  });
});

// ── Swarm Broadcast Workflow ────────────────────────────────────────────────

interface SwarmBroadcastInput {
  topic: string;
  content: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export const swarmBroadcastWorkflow = serve(async (context) => {
  const input = context.request.body as SwarmBroadcastInput;
  if (!input.topic || !input.content) {
    return context.response.json(400, { error: 'Missing topic or content' });
  }

  // Dispatch to all agents in parallel
  const agents = ['ci-watcher', 'pipeline-guardian', 'knowledge-curator'];
  
  const dispatches = await context.run('broadcast-all', async () => {
    const results = [];
    for (const agentId of agents) {
      try {
        const msgId = await dispatchAgentTask({
          agentId,
          task: `broadcast:${input.topic}`,
          metadata: { content: input.content, priority: input.priority ?? 'NORMAL' },
          timestamp: new Date().toISOString(),
        });
        results.push({ agentId, msgId, status: 'dispatched' });
      } catch (e) {
        results.push({ agentId, status: 'failed', error: String(e) });
      }
    }
    return results;
  });

  // Wait for acknowledgments (parallel)
  const acks = [];
  for (const agentId of agents) {
    const ack = await context.waitForEvent<{ acknowledged: boolean }>(
      `agent:${agentId}:ack`,
      { timeout: 60_000 } // 1 min per agent
    );
    acks.push({ agentId, ack: ack?.data });
  }

  await context.notify(`workflow:swarm-broadcast:complete`, {
    topic: input.topic,
    dispatches,
    acks,
    completedAt: new Date().toISOString(),
  });

  return context.response.json(200, {
    success: true,
    topic: input.topic,
    dispatches,
    acks,
  });
});

// ── Session Checkpoint Workflow ─────────────────────────────────────────────

export const sessionCheckpointWorkflow = serve(async (context) => {
  const { sessionId } = context.request.body as { sessionId: string };
  if (!sessionId) {
    return context.response.json(400, { error: 'Missing sessionId' });
  }

  // Schedule checkpoint at next interval
  const nextCheckpoint = new Date(Date.now() + 300_000); // 5 min
  await context.sleepUntil(nextCheckpoint);

  // Run checkpoint logic
  await context.run('checkpoint', async () => {
    console.log(`[workflow] checkpoint for session ${sessionId}`);
    // TODO: integrate with session-checkpoint.mjs
  });

  return context.response.json(200, {
    success: true,
    sessionId,
    nextCheckpoint: nextCheckpoint.toISOString(),
  });
});
