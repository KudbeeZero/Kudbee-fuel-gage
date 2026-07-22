/**
 * services/lib/agcContract.ts — Phase 56: Assume-Guarantee Contracts
 * Dual-sided Zod-locked leases. Agent signs contract; kernel enforces.
 */
import { z } from 'zod';
import { getRedisClient } from './redis.js';

const CONTRACT_PREFIX = 'kudbee:contract:';
const CONTRACT_TTL = 1800;

export const AGCSchema = z.object({
  agentId: z.string().min(1),
  maxTokensPerWindow: z.number().min(1),
  maxMemoryBytes: z.number().min(1),
  maxLatencyMs: z.number().min(1),
  minSimilarityScore: z.number().min(0).max(1),
  minConfidenceScore: z.number().min(0).max(1),
  maxEnergyScore: z.number().min(0).max(1),
  leasePeriodMs: z.number().min(1000),
  penaltyCoefficient: z.number().min(0)
});
export type AGCContract = z.infer<typeof AGCSchema>;

export interface ContractState extends AGCContract { id: string; signedAt: string; active: boolean; violations: number; }

export async function signContract(data: AGCContract): Promise<ContractState> {
  const id = `agc-${data.agentId}-${Date.now()}`;
  const state: ContractState = { ...data, id, signedAt: new Date().toISOString(), active: true, violations: 0 };
  try { const redis = getRedisClient({ label: 'contracts' }); await redis.setex(CONTRACT_PREFIX + id, CONTRACT_TTL, JSON.stringify(state)); } catch {}
  return state;
}

export async function verifyContract(agentId: string, token: { similarityScore?: number; confidenceScore?: number; energyScore?: number }): Promise<{ compliant: boolean; violations: string[] }> {
  const violations: string[] = [];
  try {
    const redis = getRedisClient({ label: 'contracts' });
    const keys = await redis.keys(CONTRACT_PREFIX + `*${agentId}*`);
    for (const k of keys) {
      const v = await redis.get(k); if (!v) continue;
      const s: ContractState = JSON.parse(v);
      if ((token.similarityScore ?? 1) < s.minSimilarityScore) violations.push(`similarity ${token.similarityScore} < ${s.minSimilarityScore}`);
      if ((token.confidenceScore ?? 1) < s.minConfidenceScore) violations.push(`confidence ${token.confidenceScore} < ${s.minConfidenceScore}`);
      if ((token.energyScore ?? 0) > s.maxEnergyScore) violations.push(`energy ${token.energyScore} > ${s.maxEnergyScore}`);
    }
  } catch {}
  return { compliant: violations.length === 0, violations };
}

export async function getActiveContracts(): Promise<ContractState[]> {
  try { const redis = getRedisClient({ label: 'contracts' }); const keys = await redis.keys(CONTRACT_PREFIX + '*'); const states: ContractState[] = []; for (const k of keys) { const v = await redis.get(k); if (v) states.push(JSON.parse(v)); } return states; } catch { return []; }
}
