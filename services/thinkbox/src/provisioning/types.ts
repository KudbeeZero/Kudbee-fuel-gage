/**
 * THINKBOX PR-003 — Environment Provisioning Types
 *
 * Defines the provisioning manifest generated from a ProjectIntelligenceManifest.
 * Outputs Dockerfiles, docker-compose configs, nix flakes, and runtime setup scripts.
 */

export type ProvisionTarget = 'docker' | 'nix' | 'devcontainer' | 'heroku';

export interface RuntimeRequirement {
  kind: 'node' | 'python' | 'rust' | 'go' | 'ruby' | 'java' | 'php' | 'dotnet';
  version: string | null;
  packageManager?: string;
}

export interface ServiceRequirement {
  name: string;
  image: string;
  port?: number;
  envVars: string[];
  volumes?: string[];
}

export interface ProvisionConfig {
  workspaceId: string;
  generatedAt: string;
  target: ProvisionTarget;
  runtimes: RuntimeRequirement[];
  services: ServiceRequirement[];
  installCommands: string[];
  buildCommand: string | null;
  startCommand: string | null;
  testCommand: string | null;
  devCommand: string | null;
  environmentVariables: Array<{ name: string; required: boolean; defaultValue?: string }>;
  files: Record<string, string>; // filename -> content
}

export interface ProvisionResult {
  success: boolean;
  config: ProvisionConfig | null;
  errors: string[];
  warnings: string[];
}
