/**
 * THINKBOX PR-002 — Project Intelligence Engine unit tests (bun:test).
 *
 * Verifies deterministic dependency resolution, env var detection, service
 * discovery, and manifest generation across fixture projects.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../src/intelligence/engine.ts';
import type { Workspace } from '../src/registry.ts';

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'thinkbox-intel-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

function makeWorkspace(root: string): Workspace {
  return {
    workspaceId: 'test-001',
    name: 'test-project',
    sourceType: 'directory',
    sourceLocation: root,
    importPath: root,
    createdAt: new Date().toISOString(),
    state: 'detected',
    detectionStatus: 'complete',
    manifestVersion: 1,
  };
}

describe('thinkbox intelligence engine', () => {
  test('resolves npm project with dependencies and lockfile', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'test-pkg',
        dependencies: { react: '^18.0.0', lodash: '^4.17.21' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'package-lock.json': '{}',
      'src/index.ts': 'export {}',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.languages).toContain('typescript');
    expect(m.packageManagers).toContain('npm');
    expect(m.dependencies.length).toBeGreaterThan(0);
    const npmDep = m.dependencies.find(d => d.manager === 'npm');
    expect(npmDep).toBeDefined();
    expect(npmDep!.lockfilePresent).toBe(true);
    expect(npmDep!.direct.some(e => e.name === 'react')).toBe(true);
    expect(npmDep!.direct.some(e => e.name === 'typescript')).toBe(true);
  });

  test('resolves bun project with bun.lock', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'bun-app',
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0' },
      }),
      'bun.lock': '{}',
      'bunfig.toml': '',
      'src/index.ts': 'export {}',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.packageManagers).toContain('bun');
    const bunDep = m.dependencies.find(d => d.manager === 'bun');
    expect(bunDep).toBeDefined();
    expect(bunDep!.lockfilePresent).toBe(true);
    expect(bunDep!.resolutionState).toBe('complete');
  });

  test('resolves pnpm project with pnpm-lock and workspace', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'pnpm-mono',
        dependencies: { express: '^4.18.0' },
      }),
      'pnpm-lock.yaml': 'lockfileVersion: 6.0',
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.packageManagers).toContain('pnpm');
    const pnpmDep = m.dependencies.find(d => d.manager === 'pnpm');
    expect(pnpmDep!.lockfilePresent).toBe(true);
    expect(pnpmDep!.workspacePackages.length).toBeGreaterThan(0);
  });

  test('resolves Python/poetry project', () => {
    const root = fixture({
      'pyproject.toml': `[tool.poetry.dependencies]
python = "^3.10"
fastapi = "^0.100.0"
[tool.poetry.group.dev.dependencies]
pytest = "^7.0.0"`,
      'poetry.lock': '',
      'main.py': 'print("hello")',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.languages).toContain('python');
    expect(m.packageManagers).toContain('poetry');
    const pipDep = m.dependencies.find(d => d.manager === 'poetry');
    expect(pipDep).toBeDefined();
    expect(pipDep!.lockfilePresent).toBe(true);
  });

  test('resolves Cargo/Rust project', () => {
    const root = fixture({
      'Cargo.toml': `[package]
name = "test-crate"
[dependencies]
serde = "1.0"
[dev-dependencies]
tokio = { version = "1.0", features = ["full"] }`,
      'Cargo.lock': '',
      'src/main.rs': 'fn main() {}',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.languages).toContain('rust');
    expect(m.packageManagers).toContain('cargo');
    const cargoDep = m.dependencies.find(d => d.manager === 'cargo');
    expect(cargoDep!.direct.some(e => e.name === 'serde')).toBe(true);
  });

  test('resolves Go project', () => {
    const root = fixture({
      'go.mod': `module example.com/test

go 1.21

require (
  github.com/gin-gonic/gin v1.9.1
  github.com/go-redis/redis/v8 v8.11.5
)`,
      'go.sum': '',
      'main.go': 'package main',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.languages).toContain('go');
    expect(m.packageManagers).toContain('go-modules');
    const goDep = m.dependencies.find(d => d.manager === 'go-modules');
    expect(goDep!.direct.some(e => e.name === 'github.com/gin-gonic/gin')).toBe(true);
  });

  test('detects environment variables from .env.example', () => {
    const root = fixture({
      '.env.example': 'DATABASE_URL=postgres://localhost\nREDIS_URL=redis://localhost\nOPENAI_API_KEY=\n# optional\nDEBUG_MODE= #optional',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.env.length).toBeGreaterThanOrEqual(3);
    expect(m.env.some(e => e.name === 'DATABASE_URL' && e.category === 'database')).toBe(true);
    expect(m.env.some(e => e.name === 'REDIS_URL' && e.category === 'cache')).toBe(true);
    expect(m.env.some(e => e.name === 'OPENAI_API_KEY' && e.category === 'api-key')).toBe(true);
  });

  test('detects scripts from package.json', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'scripts-test',
        scripts: {
          build: 'tsc',
          start: 'node dist/index.js',
          test: 'jest',
          dev: 'tsx watch src/index.ts',
          lint: 'eslint .',
          format: 'prettier --write .',
          deploy: 'gh workflow deploy',
        },
      }),
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.scripts.build.length).toBeGreaterThan(0);
    expect(m.scripts.start.length).toBeGreaterThan(0);
    expect(m.scripts.test.length).toBeGreaterThan(0);
    expect(m.scripts.dev.length).toBeGreaterThan(0);
    expect(m.scripts.lint.length).toBeGreaterThan(0);
    expect(m.scripts.format.length).toBeGreaterThan(0);
    expect(m.scripts.other.some(o => o.name === 'deploy')).toBe(true);
  });

  test('detects services: PostgreSQL, Redis, OpenAI, Stripe', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'service-test',
        dependencies: {
          pg: '^8.0.0',
          ioredis: '^5.0.0',
          openai: '^4.0.0',
          stripe: '^14.0.0',
          'firebase': '^10.0.0',
        },
      }),
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.services.some(s => s.name === 'PostgreSQL')).toBe(true);
    expect(m.services.some(s => s.name === 'Redis')).toBe(true);
    expect(m.services.some(s => s.name === 'OpenAI')).toBe(true);
    expect(m.services.some(s => s.name === 'Stripe')).toBe(true);
    expect(m.services.some(s => s.name === 'Firebase')).toBe(true);
  });

  test('detects CI and deployment configurations', () => {
    const root = fixture({
      '.github/workflows/ci.yml': 'name: CI',
      'Procfile': 'web: node server.js',
      'app.json': '{}',
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.ci.systems).toContain('github-actions');
    expect(m.deploy.targets).toContain('heroku');
  });

  test('detects Node runtime from engines field', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'runtime-test',
        engines: { node: '>=22.0.0', npm: '>=10.0.0' },
      }),
    });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.runtimes.some(r => r.kind === 'node')).toBe(true);
  });

  test('is deterministic — same input produces identical output (ignoring timestamp)', () => {
    const files = {
      'package.json': JSON.stringify({
        name: 'det-test',
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'package-lock.json': '{}',
      'src/index.ts': 'export {}',
    };

    const a = buildManifest(makeWorkspace(fixture(files)));
    const b = buildManifest(makeWorkspace(fixture(files)));

    expect(a.languages).toEqual(b.languages);
    expect(a.frameworks).toEqual(b.frameworks);
    expect(a.packageManagers).toEqual(b.packageManagers);
    expect(a.dependencies.length).toBe(b.dependencies.length);
    expect(a.runtimes.length).toBe(b.runtimes.length);
    expect(a.services.length).toBe(b.services.length);
    expect(a.ci.systems).toEqual(b.ci.systems);
    expect(a.deploy.targets).toEqual(b.deploy.targets);
    expect(a.totalFiles).toBe(b.totalFiles);
    expect(a.packageCount).toBe(b.packageCount);
    expect(a.confidence).toBe(b.confidence);
    expect(a.summary).toBe(b.summary);
  });

  test('handles empty project gracefully', () => {
    const root = fixture({ '.gitignore': '' });
    const ws = makeWorkspace(root);
    const m = buildManifest(ws);

    expect(m.languages).toHaveLength(0);
    expect(m.dependencies).toHaveLength(0);
    expect(m.services).toHaveLength(0);
    expect(m.confidence).toBe(0);
  });
});
