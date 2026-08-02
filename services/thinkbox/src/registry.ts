/**
 * services/thinkbox/src/registry.ts
 * ---------------------------------------------------------------------------
 * THINKBOX Workspace Registry — the durable root object for the platform.
 *
 * A Workspace is a normalized description of one project source. It is created
 * by the Universal Import Layer, annotated by the Detection Engine, and
 * serialized as the canonical manifest (thinkbox.json).
 *
 * Responsibilities (single responsibility per component):
 *   - Define the Workspace type (identity card).
 *   - Persist/load workspace records on disk (durable, JSON-file backed).
 *
 * Non-goals:
 *   - Detection, import, or execution live in other modules.
 * ---------------------------------------------------------------------------
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

/** Supported ingress source types. */
export type SourceType = 'git' | 'zip' | 'directory';

/** Lifecycle state of a workspace. */
export type WorkspaceState =
  | 'created'
  | 'detecting'
  | 'detected'
  | 'failed';

/** Canonical detection output — what the system learned, not assumed. */
export interface DetectionResult {
  /** Detected programming languages, e.g. ["typescript", "python"]. */
  languages: string[];
  /** Detected frameworks, e.g. ["react", "express", "vite"]. */
  frameworks: string[];
  /** Detected package managers, e.g. ["npm", "bun", "pnpm"]. */
  packageManagers: string[];
  /** Detected build systems, e.g. ["turbo", "make", "vite"]. */
  buildSystems: string[];
  /** Monorepo indicators present (workspaces field, multiple manifests, ...). */
  monorepoIndicators: string[];
  /** Notable configuration files found (turbo.json, Dockerfile, ...). */
  configFiles: string[];
  /** Presence of Docker-related files. */
  docker: { present: boolean; files: string[] };
  /** Presence of CI configuration. */
  ci: { present: boolean; files: string[] };
  /** Documentation entry points (README, docs/, ...). */
  documentation: { present: boolean; files: string[] };
  /** Candidate entry points (package.json, main.py, src/index.ts, ...). */
  entryPoints: string[];
  /** Number of package manifests found (package.json count). */
  packageCount: number;
  /** 0..1 confidence in the overall detection. */
  confidence: number;
}

/** Machine-readable summary for downstream agents (orchestration input). */
export interface EngineeringSummary {
  workspaceId: string;
  projectType: string[];
  technologies: string[];
  entryPoints: string[];
  packageCount: number;
  documentationStatus: 'complete' | 'partial' | 'none';
  confidenceScore: number;
  recommendedNextAction: string;
}

/** The durable workspace root object. */
export interface Workspace {
  /** Unique workspace identifier (uuid). */
  workspaceId: string;
  /** Human-readable name derived from the source. */
  name: string;
  /** Ingress type. */
  sourceType: SourceType;
  /** Original source location (git URL, zip path, directory path). */
  sourceLocation: string;
  /** Normalized on-disk location of the imported project. */
  importPath: string;
  /** Creation timestamp (ISO-8601). */
  createdAt: string;
  /** Current lifecycle state. */
  state: WorkspaceState;
  /** Detection status (null until detection runs). */
  detectionStatus: 'pending' | 'complete' | 'failed' | null;
  /** Manifest schema version this record conforms to. */
  manifestVersion: number;
  /** Canonical detection output. */
  detection?: DetectionResult;
  /** Engineering summary for orchestration. */
  summary?: EngineeringSummary;
}

export const MANIFEST_VERSION = 1;

/** Root registry directory. Runtime state — excluded from git (see .gitignore). */
export const THINKBOX_DIR = join(process.cwd(), '.kilo', 'thinkbox');
export const WORKSPACES_DIR = join(THINKBOX_DIR, 'workspaces');
const INDEX_PATH = join(THINKBOX_DIR, 'index.json');

function ensureRegistry() {
  mkdirSync(WORKSPACES_DIR, { recursive: true });
}

function indexFilePath(id: string): string {
  return join(WORKSPACES_DIR, `${id}.json`);
}

/** Create a new workspace record (state: created). Returns the record. */
export function createWorkspace(input: {
  name: string;
  sourceType: SourceType;
  sourceLocation: string;
  importPath: string;
}): Workspace {
  ensureRegistry();
  const workspace: Workspace = {
    workspaceId: crypto.randomUUID(),
    name: input.name,
    sourceType: input.sourceType,
    sourceLocation: input.sourceLocation,
    importPath: input.importPath,
    createdAt: new Date().toISOString(),
    state: 'created',
    detectionStatus: null,
    manifestVersion: MANIFEST_VERSION,
  };
  saveWorkspace(workspace);
  return workspace;
}

/** Persist a workspace record to disk. */
export function saveWorkspace(workspace: Workspace): void {
  ensureRegistry();
  writeFileSync(indexFilePath(workspace.workspaceId), JSON.stringify(workspace, null, 2), 'utf8');
  writeFileSync(
    INDEX_PATH,
    JSON.stringify({ version: MANIFEST_VERSION, updatedAt: new Date().toISOString(), count: listWorkspaceIds().length }, null, 2),
    'utf8'
  );
}

/** Load a single workspace record by id. Returns null if missing. */
export function getWorkspace(workspaceId: string): Workspace | null {
  const path = indexFilePath(workspaceId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Workspace;
  } catch {
    return null;
  }
}

/** List all persisted workspace ids. */
export function listWorkspaceIds(): string[] {
  ensureRegistry();
  return readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

/** List all workspace records. */
export function listWorkspaces(): Workspace[] {
  return listWorkspaceIds().map(getWorkspace).filter((w): w is Workspace => w !== null);
}

/** Transition a workspace to a new lifecycle state. */
export function updateState(workspace: Workspace, state: WorkspaceState): Workspace {
  workspace.state = state;
  saveWorkspace(workspace);
  return workspace;
}
