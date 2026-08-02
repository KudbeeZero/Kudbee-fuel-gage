/**
 * services/thinkbox/src/orchestrator.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Orchestrator — the intake pipeline.
 *
 * Runs the full Objective-001 flow for one input:
 *
 *   import source → create workspace → detect → build summary →
 *   write manifest → publish events
 *
 * Single responsibility: sequence the stages. Stage logic lives in its own
 * module (importer, registry, detection, manifest, events).
 *
 * Non-goals (explicit):
 *   - No dependency installation, builds, tests, execution, or deployment.
 * ---------------------------------------------------------------------------
 */

import { importSource } from './importer.ts';
import { createWorkspace, updateState, saveWorkspace, type Workspace } from './registry.ts';
import { detectProject } from './detection/engine.ts';
import { buildSummary, writeManifest } from './manifest.ts';
import { publishWorkspaceEvent } from './events.ts';

export interface DetectOutcome {
  workspace: Workspace;
  manifestPath: string;
}

/**
 * Intake one supported input (git URL, ZIP, or directory) and produce a
 * normalized, detected workspace with a canonical manifest.
 */
export function intakeAndDetect(input: string): DetectOutcome {
  // 1. Import — normalize the source into a scan-ready directory.
  const descriptor = importSource(input);

  // 2. Register — create the durable workspace root object.
  const workspace = createWorkspace({
    name: descriptor.name,
    sourceType: descriptor.sourceType,
    sourceLocation: descriptor.sourceLocation,
    importPath: descriptor.importPath,
  });
  publishWorkspaceEvent({ topic: 'workspace:created', workspace });

  try {
    updateState(workspace, 'detecting');

    // 3. Detect — deterministic project understanding.
    const detection = detectProject(workspace.importPath);

    // 4. Summarize + persist manifest.
    const summary = buildSummary(workspace, detection);
    workspace.detection = detection;
    workspace.summary = summary;
    workspace.detectionStatus = 'complete';
    updateState(workspace, 'detected');
    saveWorkspace(workspace);

    const manifestPath = writeManifest(workspace, detection);

    // 5. Announce — downstream services subscribe, not poll.
    publishWorkspaceEvent({ topic: 'workspace:detected', workspace, detection, summary });

    return { workspace, manifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workspace.detectionStatus = 'failed';
    updateState(workspace, 'failed');
    publishWorkspaceEvent({ topic: 'workspace:failed', workspace, error: message });
    throw new Error(`THINKBOX intake failed for "${input}": ${message}`);
  }
}
