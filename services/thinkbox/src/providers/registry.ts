/**
 * OPS-013 — Provider Registry
 *
 * Unified provider interface. Every model provider implements the same
 * contract. Tracks tokens, cost, latency, success/failure per request.
 */

export interface ProviderRequest {
  prompt: string;
  taskType: 'architecture' | 'refactoring' | 'implementation' | 'testing' | 'documentation' | 'review' | 'debugging' | 'long-context' | 'planning';
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderResponse {
  content: string;
  tokensUsed: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  error: string | null;
  retryCount: number;
  confidence: number;
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  failureRate: number;
  retryRate: number;
  byTaskType: Record<string, { requests: number; successRate: number; avgCost: number }>;
}

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  readonly costPer1kTokens: number;
  process(request: ProviderRequest): Promise<ProviderResponse>;
  getMetrics(): ProviderMetrics;
  healthCheck(): Promise<boolean>;
}

export interface ProviderEvaluation {
  providerId: string;
  taskType: string;
  score: number;
  requests: number;
  successRate: number;
  avgCost: number;
  avgLatencyMs: number;
  recommendation: 'strong' | 'suitable' | 'not-recommended';
}

const providers = new Map<string, Provider>();
const globalMetrics = new Map<string, ProviderMetrics>();

export function registerProvider(provider: Provider): void {
  providers.set(provider.id, provider);
  globalMetrics.set(provider.id, {
    totalRequests: 0, successfulRequests: 0, totalTokens: 0, totalCostUsd: 0,
    avgLatencyMs: 0, failureRate: 0, retryRate: 0, byTaskType: {},
  });
}

export function getProvider(id: string): Provider | undefined {
  return providers.get(id);
}

export function listProviders(): Provider[] {
  return [...providers.values()];
}

export function recordRequest(providerId: string, response: ProviderResponse, taskType: string): void {
  const m = globalMetrics.get(providerId);
  if (!m) return;
  m.totalRequests++;
  if (response.success) m.successfulRequests++;
  m.totalTokens += response.tokensUsed;
  m.totalCostUsd += response.costUsd;
  m.avgLatencyMs = Math.round(((m.avgLatencyMs * (m.totalRequests - 1)) + response.latencyMs) / m.totalRequests);
  m.failureRate = m.totalRequests > 0 ? Math.round(((m.totalRequests - m.successfulRequests) / m.totalRequests) * 100) / 100 : 0;
  m.retryRate = response.retryCount > 0 ? Math.round(((m.retryRate * (m.totalRequests - 1)) + 1) / m.totalRequests * 100) / 100 : m.retryRate;

  if (!m.byTaskType[taskType]) {
    m.byTaskType[taskType] = { requests: 0, successRate: 1, avgCost: 0 };
  }
  const bt = m.byTaskType[taskType];
  bt.requests++;
  bt.successRate = response.success ? ((bt.successRate * (bt.requests - 1)) + 1) / bt.requests : (bt.successRate * (bt.requests - 1)) / bt.requests;
  bt.avgCost = Math.round(((bt.avgCost * (bt.requests - 1)) + response.costUsd) / bt.requests * 10000) / 10000;
}

export function getAllProviderMetrics(): Map<string, ProviderMetrics> {
  return new Map(globalMetrics);
}

export function getProviderStatus(): Array<{ id: string; name: string; model: string; metrics: ProviderMetrics; healthy: boolean }> {
  return [...providers.values()].map(p => ({
    id: p.id, name: p.name, model: p.model,
    metrics: globalMetrics.get(p.id) ?? { totalRequests: 0, successfulRequests: 0, totalTokens: 0, totalCostUsd: 0, avgLatencyMs: 0, failureRate: 0, retryRate: 0, byTaskType: {} },
    healthy: true,
  }));
}
