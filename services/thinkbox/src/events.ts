/**
 * services/thinkbox/src/events.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Event Publication.
 *
 * Announces workspace lifecycle events over the serial bus and records them
 * in the DTHINK pipeline. Downstream services subscribe to these events rather
 * than polling state — the platform's event-driven contract.
 *
 * Topics emitted:
 *   - workspace:created   — import + registry entry complete
 *   - workspace:detected  — detection + manifest complete (the primary event)
 *   - workspace:failed    — any stage errored
 * ---------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import type { DetectionResult, EngineeringSummary, Workspace } from './registry.ts';

const ROOT = process.cwd();

/** Publish a workspace lifecycle event to the serial bus + DTHINK. */
export function publishWorkspaceEvent(event: {
  topic: 'workspace:created' | 'workspace:detected' | 'workspace:failed' | 'workspace:deps-resolved' | 'workspace:provisioned' | 'workspace:indexed' | 'workspace:graph-built';
  workspace: Workspace;
  detection?: DetectionResult;
  summary?: EngineeringSummary;
  error?: string;
}): void {
  const { topic, workspace, detection, summary, error } = event;

  const data = {
    workspaceId: workspace.workspaceId,
    name: workspace.name,
    sourceType: workspace.sourceType,
    state: workspace.state,
    detection: detection
      ? {
          languages: detection.languages,
          frameworks: detection.frameworks,
          packageManagers: detection.packageManagers,
          buildSystems: detection.buildSystems,
          confidence: detection.confidence,
        }
      : null,
    summary: summary ?? null,
    error: error ?? null,
  };

  const payload = JSON.stringify(data).replace(/"/g, '\\"');
  try {
    execFileSync('node', ['scripts/serial-bus.mjs', 'publish', topic, payload], { timeout: 10_000 });
  } catch {
    // Bus publication is best-effort; detection result is already durable.
  }

  let summaryText: string;
  if (error) {
    summaryText = `THINKBOX ${workspace.name} failed: ${error}`;
  } else if (topic === 'workspace:deps-resolved') {
    summaryText = `THINKBOX ${workspace.name} dependency resolution complete`;
  } else if (topic === 'workspace:provisioned') {
    summaryText = `THINKBOX ${workspace.name} environment provisioned`;
  } else if (topic === 'workspace:indexed') {
    summaryText = `THINKBOX ${workspace.name} code indexed`;
  } else if (topic === 'workspace:graph-built') {
    summaryText = `THINKBOX ${workspace.name} architecture graph built`;
  } else {
    summaryText = `THINKBOX ${workspace.name} ${topic.replace('workspace:', '')} — ${detection?.languages.join(', ') || 'no languages'}`;
  }
  try {
    execFileSync('node', ['scripts/dthink-pipeline.mjs', 'feed', topic, summaryText], { timeout: 10_000 });
  } catch {
    // DTHINK is best-effort; workspace record is authoritative.
  }
}
