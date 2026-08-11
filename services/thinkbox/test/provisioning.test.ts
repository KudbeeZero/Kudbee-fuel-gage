import { describe, expect, test } from 'bun:test';
import type { ProjectIntelligenceManifest } from '../src/intelligence/types.ts';
import { generateProvisioning } from '../src/provisioning/engine.ts';

function baseManifest(overrides: Partial<ProjectIntelligenceManifest> = {}): ProjectIntelligenceManifest {
  return {
    workspaceId: 'test-ws',
    detectedAt: new Date().toISOString(),
    summary: 'Test Project',
    languages: ['typescript'],
    frameworks: [],
    packageManagers: [],
    dependencies: [],
    runtimes: [],
    scripts: { build: [], start: [], test: [], dev: [], lint: [], format: [], other: [] },
    env: [],
    services: [],
    cdn: { networks: [], frameworks: [], staticBuildOutput: null, evidence: [] },
    deploy: { targets: [], configFiles: [] },
    ci: { systems: [], configFiles: [] },
    entryPoints: [],
    totalFiles: 0,
    packageCount: 0,
    confidence: 1,
    ...overrides,
  };
}

describe('Provisioning Engine — language dispatch', () => {
  test('dispatches to node provisioner for typescript', () => {
    const result = generateProvisioning(baseManifest({ languages: ['typescript'], runtimes: [{ kind: 'node', version: '22.0.0', source: 'engines' }] }));
    expect(result.success).toBe(true);
    expect(result.config?.runtimes[0].kind).toBe('node');
  });

  test('dispatches to python provisioner', () => {
    const result = generateProvisioning(baseManifest({
      languages: ['python'],
      packageManagers: ['pip'],
      runtimes: [{ kind: 'python', version: '3.12', source: 'python-version' }],
    }));
    expect(result.success).toBe(true);
    expect(result.config?.runtimes[0].kind).toBe('python');
    expect(result.config?.files['Dockerfile']).toContain('python:3.12-slim');
  });

  test('dispatches to rust provisioner', () => {
    const result = generateProvisioning(baseManifest({
      languages: ['rust'],
      runtimes: [{ kind: 'rust', version: '1.80', source: 'rust-toolchain' }],
    }));
    expect(result.success).toBe(true);
    expect(result.config?.runtimes[0].kind).toBe('rust');
    expect(result.config?.files['Dockerfile']).toContain('rust:1.80');
  });

  test('dispatches to go provisioner', () => {
    const result = generateProvisioning(baseManifest({
      languages: ['go'],
      runtimes: [{ kind: 'go', version: '1.22', source: 'go.mod' }],
    }));
    expect(result.success).toBe(true);
    expect(result.config?.runtimes[0].kind).toBe('go');
    expect(result.config?.files['Dockerfile']).toContain('golang:1.22-alpine');
  });

  test('unknown language returns failure with warning', () => {
    const result = generateProvisioning(baseManifest({ languages: ['cobol'] }));
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Provisioning Engine — generated files', () => {
  test('python generates devcontainer + docker-compose with services', () => {
    const result = generateProvisioning(baseManifest({
      languages: ['python'],
      packageManagers: ['pip'],
      runtimes: [{ kind: 'python', version: '3.12', source: 'python-version' }],
      services: [
        { kind: 'database', name: 'PostgreSQL', sdk: 'psycopg2', envVarsRequired: ['DATABASE_URL'], evidence: [] },
        { kind: 'cache', name: 'Redis', sdk: 'redis', envVarsRequired: ['REDIS_URL'], evidence: [] },
      ],
    }));
    expect(result.success).toBe(true);
    const files = result.config?.files || {};
    expect(files['docker-compose.yml']).toContain('postgres:16-alpine');
    expect(files['docker-compose.yml']).toContain('redis:7-alpine');
    expect(files['.devcontainer/devcontainer.json']).toContain('ms-python.python');
  });

  test('rust uses multi-stage build', () => {
    const result = generateProvisioning(baseManifest({ languages: ['rust'], runtimes: [{ kind: 'rust', version: '1.80', source: 'rust-toolchain' }] }));
    const df = result.config?.files['Dockerfile'] || '';
    expect(df).toContain('AS builder');
    expect(df).toContain('COPY --from=builder');
  });

  test('go uses scratch runtime stage', () => {
    const result = generateProvisioning(baseManifest({ languages: ['go'], runtimes: [{ kind: 'go', version: '1.22', source: 'go.mod' }] }));
    const df = result.config?.files['Dockerfile'] || '';
    expect(df).toContain('FROM scratch');
    expect(df).toContain('CGO_ENABLED=0');
  });
});
