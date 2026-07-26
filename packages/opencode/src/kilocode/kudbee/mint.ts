import { MintOptionsSchema, MintedTokenSchema, type MintOptions, type MintedToken } from './schema';

function uuidv4(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256(input: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const buf = new TextEncoder().encode(input);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
}

export class ThinkTokenMinter {
  async mint(opts: MintOptions): Promise<MintedToken> {
    return mintToken(opts);
  }

  async packageTrajectory(token: MintedToken): Promise<string> {
    return JSON.stringify({
      id: token.id,
      hash: token.token_hash,
      kd: token.kd,
      efficacy: token.efficacy,
      coordinates: token.spatial_coordinates,
      timestamp: token.created_at
    });
  }
}

export async function mintToken(opts: MintOptions): Promise<MintedToken> {
  const parsed = MintOptionsSchema.parse(opts);
  const [x, y, z] = parsed.spatial_coordinates;
  const id = uuidv4();
  const tokenCost = Math.ceil((x + y + z) * parsed.scale_factor);
  const kd = Math.max(0, 1 - tokenCost / 1000);
  const efficacy = Math.max(0, Math.min(1, 1 - kd));

  const tokenHash = await sha256(id + JSON.stringify(parsed.spatial_coordinates));

  const token: MintedToken = {
    id,
    token_hash: tokenHash,
    spatial_coordinates: parsed.spatial_coordinates,
    kd,
    efficacy,
    status: parsed.proven_mode ? 'PROVEN' : 'PENDING_APPROVAL',
    token_cost: tokenCost,
    created_at: new Date().toISOString()
  };

  const persisted = await persistTrajectory(token);
  if (!persisted) {
    console.warn(`[mint] trajectory persistence failed for token ${token.id}`);
  }

  return MintedTokenSchema.parse(token);
}

async function persistTrajectory(token: MintedToken): Promise<boolean> {
  try {
    const endpoint = process.env.UPSTASH_TELEMETRY_URL;
    if (!endpoint) return true;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'trajectory_persist',
        token_id: token.id,
        token_hash: token.token_hash,
        kd: token.kd,
        efficacy: token.efficacy,
        status: token.status,
        timestamp: token.created_at
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
