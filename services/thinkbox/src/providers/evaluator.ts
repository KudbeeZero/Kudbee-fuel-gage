import type { ProviderEvaluation } from './registry.ts';

const TASK_CATEGORIES = ['architecture', 'refactoring', 'implementation', 'testing', 'documentation', 'review', 'debugging', 'long-context', 'planning'] as const;

const PROVIDER_BASELINE: Array<{ id: string; name: string; model: string; costPer1k: number; strengths: string[] }> = [
  { id: 'deepseek-v4', name: 'DeepSeek', model: 'DeepSeek V4 Pro', costPer1k: 0.002, strengths: ['architecture', 'planning', 'long-context', 'implementation'] },
  { id: 'openai-gpt4o', name: 'OpenAI', model: 'GPT-4o', costPer1k: 0.010, strengths: ['refactoring', 'testing', 'review'] },
  { id: 'anthropic-sonnet', name: 'Anthropic', model: 'Claude 3.5 Sonnet', costPer1k: 0.015, strengths: ['debugging', 'documentation', 'long-context'] },
  { id: 'groq-llama', name: 'Groq', model: 'Llama 3.1 70B', costPer1k: 0.001, strengths: ['implementation', 'refactoring'] },
  { id: 'google-gemini', name: 'Google', model: 'Gemini 1.5 Pro', costPer1k: 0.005, strengths: ['documentation', 'review'] },
];

export function evaluateProviderForTask(providerId: string, taskType: string): ProviderEvaluation | null {
  const baseline = PROVIDER_BASELINE.find(p => p.id === providerId);
  if (!baseline) return null;

  const isStrength = baseline.strengths.includes(taskType);
  const score = isStrength ? 0.9 : 0.6;

  return {
    providerId,
    taskType,
    score,
    requests: 0,
    successRate: 0,
    avgCost: baseline.costPer1k * 100,
    avgLatencyMs: 0,
    recommendation: score >= 0.8 ? 'strong' : score >= 0.6 ? 'suitable' : 'not-recommended',
  };
}

export function getBestProvider(taskType: string): ProviderEvaluation | null {
  const evaluations = PROVIDER_BASELINE
    .map(p => evaluateProviderForTask(p.id, taskType))
    .filter((e): e is ProviderEvaluation => e !== null)
    .sort((a, b) => b.score - a.score);
  return evaluations[0] ?? null;
}

export function getAllEvaluations(): ProviderEvaluation[] {
  return TASK_CATEGORIES.flatMap(task =>
    PROVIDER_BASELINE.map(p => evaluateProviderForTask(p.id, task)!).filter(Boolean)
  );
}

export function getProviderBaseline(): typeof PROVIDER_BASELINE {
  return PROVIDER_BASELINE;
}
