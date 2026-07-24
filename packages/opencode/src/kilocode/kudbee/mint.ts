import { MintOptionsSchema, MintedTokenSchema, type MintOptions, type MintedToken } from './schema';
import { randomUUID, createHash } from 'crypto';

export async function mintToken(opts: MintOptions): Promise<MintedToken> {
  const parsed = MintOptionsSchema.parse(opts);
  const [x, y, z] = parsed.spatial_coordinates;
  const id = randomUUID();
  const tokenCost = Math.ceil((x + y + z) * parsed.scale_factor);
  const kd = Math.max(0, 1 - tokenCost / 1000);
  const efficacy = Math.max(0, Math.min(1, 1 - kd));

  const tokenHash = createHash('sha256').update(id + JSON.stringify(parsed.spatial_coordinates)).digest('hex');

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

  return MintedTokenSchema.parse(token);
}
