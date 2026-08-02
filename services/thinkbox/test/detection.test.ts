/**
 * services/thinkbox/test/detection.test.ts
 * ---------------------------------------------------------------------------
 * Detection Engine unit tests (bun:test).
 *
 * Verifies deterministic output, correct signal application, and confidence
 * scoring across representative fixture projects.
 * ---------------------------------------------------------------------------
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProject } from '../src/detection/engine.ts';

/** Build a temp fixture project from a file map. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'thinkbox-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

describe('thinkbox detection engine', () => {
  test('detects a TypeScript + React + Vite + npm project', () => {
    const root = fixture({
      'package.json': '{"name":"web","dependencies":{"react":"18"}}',
      'package-lock.json': '{}',
      'vite.config.ts': '',
      'src/index.tsx': '',
      'README.md': '# Web App',
    });
    const d = detectProject(root);
    expect(d.languages).toContain('typescript');
    expect(d.frameworks).toContain('vite');
    expect(d.packageManagers).toContain('npm');
    expect(d.packageCount).toBe(1);
    expect(d.documentation.present).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.5);
  });

  test('detects a Python + pip project', () => {
    const root = fixture({
      'pyproject.toml': '[project]\nname="py"',
      'poetry.lock': '',
      'main.py': '',
      'README.md': '# Py',
    });
    const d = detectProject(root);
    expect(d.languages).toContain('python');
    expect(d.packageManagers).toContain('poetry');
    expect(d.entryPoints).toContain('python-entry');
  });

  test('detects a Go module project', () => {
    const root = fixture({
      'go.mod': 'module example.com/x',
      'go.sum': '',
      'main.go': '',
    });
    const d = detectProject(root);
    expect(d.languages).toContain('go');
    expect(d.packageManagers).toContain('go modules');
    expect(d.entryPoints).toContain('go-entry');
  });

  test('detects a monorepo with turbo + pnpm', () => {
    const root = fixture({
      'turbo.json': '{}',
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"',
      'package.json': '{"workspaces":["apps/*"]}',
      'apps/a/package.json': '{}',
      'apps/b/package.json': '{}',
    });
    const d = detectProject(root);
    expect(d.buildSystems).toContain('turbo');
    expect(d.monorepoIndicators).toContain('pnpm-workspace');
    expect(d.packageCount).toBe(3);
  });

  test('detects Docker + GitHub Actions CI', () => {
    const root = fixture({
      'Dockerfile': 'FROM node:22',
      'docker-compose.yml': 'services: {}',
      '.github/workflows/ci.yml': 'name: CI',
    });
    const d = detectProject(root);
    expect(d.docker.present).toBe(true);
    expect(d.docker.files).toContain('dockerfile');
    expect(d.ci.present).toBe(true);
    expect(d.ci.files).toContain('github-actions');
  });

  test('is deterministic — same input produces identical output', () => {
    const files = {
      'package.json': '{"dependencies":{"react":"18"}}',
      'package-lock.json': '{}',
      'vite.config.ts': '',
      'src/main.ts': '',
      'README.md': '# x',
    };
    const a = detectProject(fixture(files));
    const b = detectProject(fixture(files));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('reports empty project with low confidence', () => {
    const root = fixture({ '.gitignore': '' });
    const d = detectProject(root);
    expect(d.languages).toHaveLength(0);
    expect(d.confidence).toBe(0);
    expect(d.documentation.present).toBe(false);
  });

  test('throws on missing project root', () => {
    expect(() => detectProject(join(tmpdir(), 'does-not-exist-xyz'))).toThrow();
  });
});
