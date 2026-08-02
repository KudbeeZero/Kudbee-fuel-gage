import crypto from 'node:crypto';

export interface AgentKeyPair {
  agentId: string;
  publicKey: string;
  privateKey: string;
}

export interface AgentPass {
  agentId: string;
  issuedAt: number;
  signature: string;
}

const KEY_FORMAT: crypto.KeyFormat = 'pem';

export function generateAgentIdentity(agentId: string): AgentKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: KEY_FORMAT },
    privateKeyEncoding: { type: 'pkcs8', format: KEY_FORMAT }
  }) as unknown as { publicKey: string; privateKey: string };
  return { agentId, publicKey, privateKey };
}

export function signPayload(privateKey: string, payload: string): string {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString('base64');
}

export function verifySignature(publicKey: string, payload: string, signature: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export function createAgentPass(privateKey: string, agentId: string, now: number = Date.now()): AgentPass {
  const signature = signPayload(privateKey, `${agentId}:${now}`);
  return { agentId, issuedAt: now, signature };
}

export function serializePass(pass: AgentPass): string {
  return Buffer.from(JSON.stringify(pass)).toString('base64');
}

export function deserializePass(encoded: string): AgentPass | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Partial<AgentPass>;
    if (
      typeof parsed.agentId === 'string' &&
      typeof parsed.issuedAt === 'number' &&
      typeof parsed.signature === 'string'
    ) {
      return { agentId: parsed.agentId, issuedAt: parsed.issuedAt, signature: parsed.signature };
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyAgentPass(
  pass: AgentPass | null,
  publicKey: string,
  maxAgeMs: number = 60_000
): boolean {
  if (!pass) return false;
  if (Math.abs(Date.now() - pass.issuedAt) > maxAgeMs) return false;
  return verifySignature(publicKey, `${pass.agentId}:${pass.issuedAt}`, pass.signature);
}

export const AGENT_PASS_MAX_AGE_MS = 60_000;
