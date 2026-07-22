/**
 * services/lib/tokenUnion.ts
 * Phase 55 — Nash Token Unions: Collective Agent Bargaining.
 * Nash bargaining: maximize ∏(utility_i - disagreement_i) under budget R.
 * Simplified to weighted allocation by pooled affinity.
 */
import { getRedisClient } from './redis.js';

const UNION_PREFIX = 'kudbee:unions:';
const UNION_TTL = 3600;

interface UnionMember { agentId: string; kd: number; efficacy: number; }
interface UnionState { id: string; members: UnionMember[]; pooledAffinity: number; pooledEfficacy: number; formedAt: string; }

export async function formUnion(agentIds: string[]): Promise<UnionState> {
  const members: UnionMember[] = agentIds.map((id) => ({ agentId: id, kd: 0.01 + Math.random() * 0.1, efficacy: Math.random() * 0.5 }));
  const pooledAffinity = members.reduce((s, m) => s + (1 - m.kd), 0) / members.length;
  const pooledEfficacy = members.reduce((s, m) => s + m.efficacy, 0) / members.length;
  const state: UnionState = { id: `union-${Date.now()}`, members, pooledAffinity, pooledEfficacy, formedAt: new Date().toISOString() };
  try { const redis = getRedisClient({ label: 'unions' }); await redis.setex(UNION_PREFIX + state.id, UNION_TTL, JSON.stringify(state)); } catch {}
  return state;
}

export async function negotiateAllocation(unionId: string, requestedTokens: number): Promise<{ allocated: number; approved: boolean; reasoning: string }> {
  try {
    const redis = getRedisClient({ label: 'unions' });
    const raw = await redis.get(UNION_PREFIX + unionId);
    if (!raw) return { allocated: 0, approved: false, reasoning: 'Union not found or expired' };
    const state: UnionState = JSON.parse(raw);
    const budget = 1000; const alloc = Math.min(requestedTokens, Math.ceil(budget * state.pooledAffinity * state.pooledEfficacy));
    return { allocated: alloc, approved: alloc > 0, reasoning: `Nash bargain: ${alloc}/${requestedTokens} tokens allocated (affinity=${state.pooledAffinity.toFixed(3)}, efficacy=${state.pooledEfficacy.toFixed(3)})` };
  } catch { return { allocated: 0, approved: false, reasoning: 'Negotiation failed' }; }
}

export async function getActiveUnions(): Promise<UnionState[]> {
  try { const redis = getRedisClient({ label: 'unions' }); const keys = await redis.keys(UNION_PREFIX + '*'); const states: UnionState[] = []; for (const k of keys) { const v = await redis.get(k); if (v) states.push(JSON.parse(v)); } return states; } catch { return []; }
}
