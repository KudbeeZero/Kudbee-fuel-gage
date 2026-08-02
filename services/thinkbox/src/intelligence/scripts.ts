/**
 * Scripts detection.
 *
 * Extracts build, start, test, dev, lint, and format commands from
 * package.json scripts section and other project configuration files.
 */

import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { ScriptsInfo } from './types.ts';

function readJsonSafe(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

export function detectScripts(files: string[], root: string): ScriptsInfo {
  const build: string[] = [];
  const start: string[] = [];
  const test: string[] = [];
  const dev: string[] = [];
  const lint: string[] = [];
  const format: string[] = [];
  const other: Array<{ name: string; command: string }> = [];

  const buildKeywords = ['build', 'compile', 'dist', 'bundle', 'package', 'export'];
  const startKeywords = ['start', 'serve', 'run', 'launch', 'begin', 'server'];
  const testKeywords = ['test', 'spec', 'e2e', 'integration', 'check'];
  const devKeywords = ['dev', 'develop', 'watch', 'hot'];
  const lintKeywords = ['lint', 'eslint', 'check'];
  const formatKeywords = ['format', 'fmt', 'prettier'];

  for (const f of files) {
    if (basename(f) === 'package.json' && !f.includes('node_modules')) {
      const json = readJsonSafe(join(root, f)) as PackageJson | null;
      if (!json?.scripts) continue;

      for (const [name, cmd] of Object.entries(json.scripts)) {
        const lower = name.toLowerCase();
        if (buildKeywords.some(k => lower.includes(k))) build.push(`${name}: ${cmd}`);
        else if (startKeywords.some(k => lower.includes(k))) start.push(`${name}: ${cmd}`);
        else if (testKeywords.some(k => lower.includes(k))) test.push(`${name}: ${cmd}`);
        else if (devKeywords.some(k => lower.includes(k))) dev.push(`${name}: ${cmd}`);
        else if (lintKeywords.some(k => lower.includes(k))) lint.push(`${name}: ${cmd}`);
        else if (formatKeywords.some(k => lower.includes(k))) format.push(`${name}: ${cmd}`);
        else other.push({ name, command: cmd });
      }
    }
  }

  const hasMakefile = files.some(f => basename(f) === 'Makefile');
  if (hasMakefile) {
    const content = readTextSafe(join(root, files.find(f => basename(f) === 'Makefile')!));
    if (content) {
      for (const line of content.split('\n')) {
        const m = line.match(/^([a-zA-Z_-]+)\s*:/);
        if (m && !m[1].startsWith('.')) {
          const name = m[1];
          if (buildKeywords.some(k => name.includes(k))) build.push(`make ${name}`);
          else if (testKeywords.some(k => name.includes(k))) test.push(`make ${name}`);
          else if (devKeywords.some(k => name.includes(k))) dev.push(`make ${name}`);
          else other.push({ name: `make ${name}`, command: `make ${name}` });
        }
      }
    }
  }

  return { build, start, test, dev, lint, format, other };
}
