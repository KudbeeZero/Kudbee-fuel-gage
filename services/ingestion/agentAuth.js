import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deserializePass,
  verifyAgentPass,
  verifySignature,
  AGENT_PASS_MAX_AGE_MS,
} from '@kudbee/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_AGENT_REGISTRY_PATH =
  process.env.AGENT_REGISTRY_PATH || path.resolve(__dirname, '../../config/agents.json');

export function loadAgentRegistry(registryPath = DEFAULT_AGENT_REGISTRY_PATH) {
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    const registry = new Map();

    for (const agent of parsed.registry || []) {
      if (agent?.status === 'active' && agent?.agentId && agent?.publicKey) {
        registry.set(agent.agentId, agent.publicKey);
      }
    }

    return registry;
  } catch {
    console.warn('[Synapse] Could not load agent registry — starting with empty fingerprints');
    return new Map();
  }
}

export function authenticateAgentPass(headerValue, agentRegistry = loadAgentRegistry()) {
  try {
    if (!headerValue) return null;
    const pass = deserializePass(headerValue);
    if (!pass) return null;

    const publicKey = agentRegistry.get(pass.agentId);
    if (!publicKey) return null;

    return verifyAgentPass(pass, publicKey, AGENT_PASS_MAX_AGE_MS) ? pass.agentId : null;
  } catch {
    return null;
  }
}

export function verifyAgentPassFromKey(headerValue, publicKey, expectedAgentId = null) {
  try {
    if (!headerValue || !publicKey) return null;
    const pass = deserializePass(headerValue);
    if (!pass) return null;
    if (expectedAgentId && pass.agentId !== expectedAgentId) return null;

    return verifyAgentPass(pass, publicKey, AGENT_PASS_MAX_AGE_MS) ? pass.agentId : null;
  } catch {
    return null;
  }
}

export function verifyAgentSignature(
  agentId,
  payload,
  signature,
  agentRegistry = loadAgentRegistry()
) {
  try {
    if (!agentId || !payload || !signature) return null;
    const publicKey = agentRegistry.get(agentId);
    if (!publicKey) return null;
    return verifySignature(publicKey, payload, signature) ? agentId : null;
  } catch {
    return null;
  }
}
