/**
 * services/thinkbox/src/detection/engine.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Detection Engine.
 *
 * Walks an imported project directory and produces a structured, deterministic
 * DetectionResult. Signal catalog lives in `signals.ts` — adding support for a
 * new technology is a data change, not a code change.
 *
 * Determinism: same input → same output. Files are visited once, signals are
 * applied in catalog order, results are sorted and de-duplicated.
 * ---------------------------------------------------------------------------
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import type { DetectionResult } from '../registry.ts';
import { SKIP_DIRS } from '../collectFiles.ts';
import {
  LANGUAGE_SIGNALS,
  FRAMEWORK_SIGNALS,
  PACKAGE_MANAGER_SIGNALS,
  BUILD_SYSTEM_SIGNALS,
  MONOREPO_SIGNALS,
  CI_SIGNALS,
  DOCKER_SIGNALS,
  DOCUMENTATION_SIGNALS,
  ENTRYPOINT_SIGNALS,
  type FileSignal,
} from './signals.ts';

const MAX_FILES_SCANNED = 50_000;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** Case-insensitive exact-filename match against the signal's file list. */
function matchesFile(signal: FileSignal, fileName: string, relPath: string): boolean {
  return (signal.files ?? []).some((f) => {
    const normalized = f.replace(/^\.\//, '');
    const candidate = relPath.replace(/\\/g, '/');
    if (normalized.includes('/')) return candidate === normalized || candidate.endsWith(`/${normalized}`);
    return fileName.toLowerCase() === normalized.toLowerCase();
  });
}

/** Case-insensitive extension match. */
function matchesExtension(signal: FileSignal, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (signal.extensions ?? []).some((ext) => lower.endsWith(ext.toLowerCase()));
}

/** Apply a signal catalog across a file, returning matched labels. */
function applySignals(signals: FileSignal[], fileName: string, relPath: string): string[] {
  const labels: string[] = [];
  for (const signal of signals) {
    if (matchesFile(signal, fileName, relPath) || matchesExtension(signal, fileName)) {
      labels.push(...signal.labels);
    }
  }
  return labels;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

interface WalkCollector {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  buildSystems: string[];
  monorepoIndicators: string[];
  configFiles: string[];
  dockerFiles: string[];
  ciFiles: string[];
  docFiles: string[];
  entryPoints: string[];
  packageCount: number;
  totalFiles: number;
}

/** Recursively walk the project, applying signals to each file. */
function walk(projectRoot: string, collector: WalkCollector): void {
  const stack = [projectRoot];
  let scanned = 0;

  while (stack.length > 0 && scanned < MAX_FILES_SCANNED) {
    const current = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = relative(projectRoot, fullPath);

      if (isDirectory(fullPath)) {
        if (!SKIP_DIRS.has(entry)) stack.push(fullPath);
        continue;
      }

      scanned += 1;
      collector.totalFiles += 1;

      // Directory-labeled signals (e.g. docs/) are matched against the relPath
      // prefix; detect them here for documentation indicators.
      for (const signal of DOCUMENTATION_SIGNALS) {
        const docRel = relPath.replace(/\\/g, '/');
        if ((signal.files ?? []).some((f) => f.endsWith('/') && docRel.startsWith(f))) {
          collector.docFiles.push(...signal.labels);
        }
      }

      collector.languages.push(...applySignals(LANGUAGE_SIGNALS, entry, relPath));
      collector.frameworks.push(...applySignals(FRAMEWORK_SIGNALS, entry, relPath));
      collector.packageManagers.push(...applySignals(PACKAGE_MANAGER_SIGNALS, entry, relPath));
      collector.buildSystems.push(...applySignals(BUILD_SYSTEM_SIGNALS, entry, relPath));
      collector.monorepoIndicators.push(...applySignals(MONOREPO_SIGNALS, entry, relPath));
      collector.configFiles.push(...applySignals([...FRAMEWORK_SIGNALS, ...BUILD_SYSTEM_SIGNALS], entry, relPath));
      collector.dockerFiles.push(...applySignals(DOCKER_SIGNALS, entry, relPath));
      collector.ciFiles.push(...applySignals(CI_SIGNALS, entry, relPath));
      collector.docFiles.push(...applySignals(DOCUMENTATION_SIGNALS, entry, relPath));
      collector.entryPoints.push(...applySignals(ENTRYPOINT_SIGNALS, entry, relPath));

      if (basename(entry) === 'package.json') collector.packageCount += 1;
    }
  }
}

/** Compute 0..1 detection confidence from signal coverage. */
function computeConfidence(languages: string[], frameworks: string[], packageManagers: string[]): number {
  const weights: [number, number][] = [
    [languages.length, 0.5],
    [frameworks.length, 0.3],
    [packageManagers.length, 0.2],
  ];
  let score = 0;
  for (const [count, weight] of weights) {
    if (count > 0) score += Math.min(count, 3) / 3 * weight;
  }
  return Math.round(Math.min(1, score) * 100) / 100;
}

/**
 * Run detection over an imported project directory.
 *
 * @param projectRoot absolute path to the project root to scan.
 * @returns a deterministic DetectionResult.
 */
export function detectProject(projectRoot: string): DetectionResult {
  if (!existsSync(projectRoot)) throw new Error(`Project root not found: ${projectRoot}`);

  const collector: WalkCollector = {
    languages: [],
    frameworks: [],
    packageManagers: [],
    buildSystems: [],
    monorepoIndicators: [],
    configFiles: [],
    dockerFiles: [],
    ciFiles: [],
    docFiles: [],
    entryPoints: [],
    packageCount: 0,
    totalFiles: 0,
  };

  walk(projectRoot, collector);

  const languages = uniqueSorted(collector.languages);
  const frameworks = uniqueSorted(collector.frameworks);
  const packageManagers = uniqueSorted(collector.packageManagers);

  const detection: DetectionResult = {
    languages,
    frameworks,
    packageManagers,
    buildSystems: uniqueSorted(collector.buildSystems),
    monorepoIndicators: uniqueSorted(collector.monorepoIndicators),
    configFiles: uniqueSorted(collector.configFiles),
    docker: { present: collector.dockerFiles.length > 0, files: uniqueSorted(collector.dockerFiles) },
    ci: { present: collector.ciFiles.length > 0, files: uniqueSorted(collector.ciFiles) },
    documentation: { present: collector.docFiles.length > 0, files: uniqueSorted(collector.docFiles) },
    entryPoints: uniqueSorted(collector.entryPoints),
    packageCount: collector.packageCount,
    confidence: computeConfidence(languages, frameworks, packageManagers),
  };

  return detection;
}
