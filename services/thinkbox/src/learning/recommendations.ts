/**
 * THINKBOX PR-009 — Recommendation Engine
 *
 * Before a mission starts, generates evidence-based recommendations
 * from stored learning records. Every recommendation cites its source.
 */

import crypto from 'node:crypto';
import type { Recommendation } from './types.ts';
import { getLearningRecords, searchRecords, getHighImpactRecords } from './records.ts';

function rid(): string { return crypto.randomUUID().slice(0, 8); }

export function generateRecommendations(objective: { title: string; description: string }, context?: {
  services?: string[];
  agents?: string[];
  files?: string[];
  category?: string;
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const lowerObjective = `${objective.title} ${objective.description}`.toLowerCase();

  // 1. Category-based records
  if (context?.category) {
    const catRecords = getLearningRecords(context.category);
    for (const r of catRecords.slice(0, 5)) {
      recs.push({
        id: rid(), title: r.observation, description: `Based on ${r.category} learning: ${r.recommendation}`,
        evidence: [{ recordId: r.id, summary: r.observation }],
        confidence: r.confidence, applicableTo: context.agents ?? [], risk: r.severity === 'critical' ? 'high' : r.severity as Recommendation['risk'],
        category: r.category, createdAt: new Date().toISOString(),
      });
    }
  }

  // 2. Similar objective matching
  const similar = searchRecords(objective.title);
  for (const r of similar.slice(0, 3)) {
    recs.push({
      id: rid(), title: `Similar pattern: "${r.observation}"`, description: r.recommendation,
      evidence: [{ recordId: r.id, summary: r.observation }],
      confidence: r.confidence * 0.8, applicableTo: context?.services ?? [],
      risk: r.severity === 'high' ? 'high' : 'medium', category: r.category, createdAt: new Date().toISOString(),
    });
  }

  // 3. High-impact patterns
  for (const r of getHighImpactRecords().slice(0, 2)) {
    recs.push({
      id: rid(), title: `High-impact: "${r.observation}"`, description: r.recommendation,
      evidence: [{ recordId: r.id, summary: `${r.category}: ${r.observation}` }],
      confidence: r.confidence, applicableTo: [], risk: 'high', category: r.category, createdAt: new Date().toISOString(),
    });
  }

  // 4. Service-specific recommendations
  if (context?.services) {
    for (const svc of context.services) {
      const svcRecords = searchRecords(svc);
      for (const r of svcRecords.slice(0, 2)) {
        recs.push({
          id: rid(), title: `${svc}: ${r.observation}`, description: r.recommendation,
          evidence: [{ recordId: r.id, summary: r.observation }],
          confidence: r.confidence, applicableTo: [svc], risk: r.severity === 'high' ? 'high' : 'medium',
          category: r.category, createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return recs.slice(0, 12);
}
