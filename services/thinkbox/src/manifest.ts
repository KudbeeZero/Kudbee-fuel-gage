/**
 * services/thinkbox/src/manifest.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Manifest Generation.
 *
 * Produces the canonical `thinkbox.json` — the project's identity card. It
 * describes what the system learned, not what it assumes. Every downstream
 * service consumes this manifest rather than re-scanning the project.
 *
 * Also builds the EngineeringSummary, a machine-readable orchestration input.
 * ---------------------------------------------------------------------------
 */

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { DetectionResult, EngineeringSummary, Workspace } from './registry.ts';

export interface ThinkboxManifest {
  schema: string;
  version: number;
  workspace: {
    workspaceId: string;
    name: string;
    sourceType: string;
    sourceLocation: string;
    createdAt: string;
    state: string;
  };
  detection: DetectionResult;
  summary: EngineeringSummary;
}

/** Convert a DetectionResult into a machine-readable engineering summary. */
export function buildSummary(workspace: Workspace, detection: DetectionResult): EngineeringSummary {
  const techStack = [...detection.languages, ...detection.frameworks, ...detection.packageManagers, ...detection.buildSystems];
  const docFiles = detection.documentation.files;
  const documentationStatus: EngineeringSummary['documentationStatus'] =
    docFiles.length === 0 ? 'none' : docFiles.length >= 3 ? 'complete' : 'partial';

  const recommendedNextAction =
    detection.packageManagers.length > 0
      ? 'install-dependencies'
      : detection.languages.length > 0
        ? 'index-code'
        : 'review-manifest';

  return {
    workspaceId: workspace.workspaceId,
    projectType: [...detection.languages, ...detection.frameworks].slice(0, 5),
    technologies: techStack.slice(0, 12),
    entryPoints: detection.entryPoints.slice(0, 5),
    packageCount: detection.packageCount,
    documentationStatus,
    confidenceScore: detection.confidence,
    recommendedNextAction,
  };
}

/** Serialize the canonical thinkbox.json manifest for a workspace. */
export function buildManifest(workspace: Workspace, detection: DetectionResult): ThinkboxManifest {
  return {
    schema: 'https://kudbee.thinkbox/schema/manifest',
    version: workspace.manifestVersion,
    workspace: {
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      sourceType: workspace.sourceType,
      sourceLocation: workspace.sourceLocation,
      createdAt: workspace.createdAt,
      state: workspace.state,
    },
    detection,
    summary: buildSummary(workspace, detection),
  };
}

/** Write the manifest to the workspace import directory as thinkbox.json. */
export function writeManifest(workspace: Workspace, detection: DetectionResult): string {
  const manifest = buildManifest(workspace, detection);
  const target = join(workspace.importPath, 'thinkbox.json');
  writeFileSync(target, JSON.stringify(manifest, null, 2), 'utf8');
  return target;
}
