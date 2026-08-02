/**
 * THINKBOX PR-002 — Project Intelligence Engine
 *
 * Core type definitions for the intelligence layer. Every field is evidence-based,
 * derived from file-system inspection only. No execution, no network, no installs.
 */

export type PackageManagerKind =
  | 'npm'
  | 'bun'
  | 'pnpm'
  | 'yarn'
  | 'pip'
  | 'poetry'
  | 'cargo'
  | 'go-modules'
  | 'composer'
  | 'bundler'
  | 'maven'
  | 'gradle'
  | 'unknown';

export interface DependencyEntry {
  name: string;
  version: string | null;
  category: 'dependency' | 'dev-dep' | 'peer-dep' | 'optional-dep' | 'workspace';
}

export interface DependencyInfo {
  manager: PackageManagerKind;
  lockfilePresent: boolean;
  lockfilePath: string | null;
  lockfileKind: string | null;
  packageManifestPath: string;
  direct: DependencyEntry[];
  transitiveCount: number;
  totalCount: number;
  resolutionState: 'complete' | 'partial' | 'none';
  workspacePackages: string[];
  workspaceCount: number;
}

export interface EnvVarRequirement {
  name: string;
  source: '.env.example' | '.env' | 'code' | 'config';
  required: boolean;
  category: 'database' | 'cache' | 'api-key' | 'url' | 'auth' | 'feature' | 'other';
}

export interface ScriptsInfo {
  build: string[];
  start: string[];
  test: string[];
  dev: string[];
  lint: string[];
  format: string[];
  other: Array<{ name: string; command: string }>;
}

export interface RuntimeInfo {
  kind: string;
  version: string | null;
  source: 'engines' | 'tool-versions' | 'nvmrc' | 'python-version' | 'rust-toolchain' | 'go.mod' | 'other';
}

export interface ServiceInfo {
  kind: 'database' | 'cache' | 'ai' | 'queue' | 'storage' | 'monitoring' | 'auth' | 'ci' | 'deploy' | 'other';
  name: string;
  sdk: string | null;
  envVarsRequired: string[];
  evidence: string[];
}

export interface CdnInfo {
  networks: string[];
  frameworks: string[];
  staticBuildOutput: string | null;
  evidence: string[];
}

export interface DeployInfo {
  targets: string[];
  configFiles: string[];
}

export interface CiInfo {
  systems: string[];
  configFiles: string[];
}

export interface ProjectIntelligenceManifest {
  workspaceId: string;
  detectedAt: string;
  summary: string;
  languages: string[];
  frameworks: string[];
  packageManagers: PackageManagerKind[];
  dependencies: DependencyInfo[];
  runtimes: RuntimeInfo[];
  scripts: ScriptsInfo;
  env: EnvVarRequirement[];
  services: ServiceInfo[];
  cdn: CdnInfo;
  deploy: DeployInfo;
  ci: CiInfo;
  entryPoints: string[];
  totalFiles: number;
  packageCount: number;
  confidence: number;
}
