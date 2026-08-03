// services/qstash/client.ts
// ---------------------------------------------------------------------------
// External Logic Phase — QStash Bridge
//
// Replaces services/agents/worker.ts BRPOP loop with QStash guaranteed delivery.
// API: client.publishJSON({url, body}) → QStash retry/DLQ → endpoint handler.
//
// Signing keys for Receiver.verify() on incoming messages:
//   QSTASH_CURRENT_SIGNING_KEY  sig_75ZHHf6M9FE4PxSktZd8TAZa7Qzo
//   QSTASH_NEXT_SIGNING_KEY     sig_53GBy7yJYdF3KKgt2kmGuKaieDD7
// ---------------------------------------------------------------------------

import { Client, Receiver } from '@upstash/qstash';

export interface AgentTask {
  agentId: string;
  task: string;
  metadata?: Record<string, string>;
  timestamp: string;
}

// ── Client (publish side) ──────────────────────────────────────────────────

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
  baseUrl: process.env.QSTASH_URL,
});

export async function dispatchAgentTask(task: AgentTask): Promise<string> {
  const stagingUrl =
    process.env.STAGING_URL || 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com';

  const { messageId } = await qstash.publishJSON({
    url: `${stagingUrl}/api/agents/${task.agentId}/task`,
    body: task as unknown as Record<string, unknown>,
    retries: 3,
  });

  return messageId;
}

export async function dispatchSwarmBroadcast(message: {
  topic: string;
  content: string;
  priority?: string;
}): Promise<string> {
  const stagingUrl =
    process.env.STAGING_URL || 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com';

  const { messageId } = await qstash.publishJSON({
    url: `${stagingUrl}/api/agents/broadcast`,
    body: message as unknown as Record<string, unknown>,
    retries: 2,
    delay: message.priority === 'HIGH' ? undefined : '1s',
  });

  return messageId;
}

// ── Receiver (verify side) ─────────────────────────────────────────────────

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || 'sig_75ZHHf6M9FE4PxSktZd8TAZa7Qzo',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || 'sig_53GBy7yJYdF3KKgt2kmGuKaieDD7',
});

export async function verifyQStashMessage(signature: string, body: string): Promise<boolean> {
  if (process.env.QSTASH_DEV === 'true') return true;
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
