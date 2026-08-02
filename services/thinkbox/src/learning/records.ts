/**
 * THINKBOX PR-009 — Learning Records Store
 *
 * Persists and queries learning records. Records are versioned and
 * can be validated against future missions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LearningRecord } from './types.ts';

const MEMORY_DIR = join(process.cwd(), '.kilo', 'memory', 'learning');
const RECORDS_PATH = join(MEMORY_DIR, 'records.json');

function ensureDir(): void { mkdirSync(MEMORY_DIR, { recursive: true }); }

export function storeLearningRecord(record: LearningRecord): void {
  ensureDir();
  const records = loadAll();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  if (records.length > 1000) records.splice(0, records.length - 1000);
  writeFileSync(RECORDS_PATH, JSON.stringify(records, null, 2), 'utf8');
}

export function getLearningRecords(category?: string): LearningRecord[] {
  const all = loadAll();
  return category ? all.filter(r => r.category === category) : all;
}

export function searchRecords(query: string): LearningRecord[] {
  const lower = query.toLowerCase();
  return loadAll().filter(r =>
    r.observation.toLowerCase().includes(lower) ||
    r.recommendation.toLowerCase().includes(lower) ||
    r.category.toLowerCase().includes(lower) ||
    (r.evidence ?? []).some(e => e.toLowerCase().includes(lower))
  );
}

export function getRecordsByScope(scope: 'local' | 'global'): LearningRecord[] {
  return loadAll().filter(r => r.scope === scope);
}

export function getHighImpactRecords(): LearningRecord[] {
  return loadAll().filter(r => r.severity === 'high' || r.severity === 'critical')
    .sort((a, b) => b.confidence - a.confidence).slice(0, 20);
}

export function validateRecord(recordId: string, missionId: string, outcome: 'confirmed' | 'refuted' | 'inconclusive'): void {
  const records = loadAll();
  const r = records.find(x => x.id === recordId);
  if (!r) return;
  r.validationResults.push({ missionId, outcome, timestamp: new Date().toISOString() });
  if (outcome === 'confirmed') r.confidence = Math.min(1, r.confidence + 0.1);
  else if (outcome === 'refuted') r.confidence = Math.max(0, r.confidence - 0.2);
  writeFileSync(RECORDS_PATH, JSON.stringify(records, null, 2), 'utf8');
}

function loadAll(): LearningRecord[] {
  ensureDir();
  if (!existsSync(RECORDS_PATH)) return [];
  try { return JSON.parse(readFileSync(RECORDS_PATH, 'utf8')); } catch { return []; }
}
