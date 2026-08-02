/**
 * THINKBOX PR-002 — Project Intelligence Engine
 *
 * Orchestrator: walks a project directory, detects package managers and services,
 * dispatches to language-specific parsers, and produces a normalized
 * ProjectIntelligenceManifest. Deterministic — same input → same output.
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, basename, extname, dirname } from 'node:path';
import type { ProjectIntelligenceManifest, ScriptsInfo } from './types.ts';
import { resolveNpm } from './npm.ts';
import { resolveBun } from './bun.ts';
import { resolvePnpm } from './pnpm.ts';
import { resolvePip } from './pip.ts';
import { resolveCargo } from './cargo.ts';
import { resolveGo } from './go.ts';
import { detectEnv } from './env.ts';
import { detectScripts } from './scripts.ts';
import { detectServices } from './services.ts';
import type { Workspace, DetectionResult } from '../registry.ts';
import type { DependencyInfo, RuntimeInfo, DeployInfo, CiInfo, CdnInfo } from './types.ts';

const MAX_FILES = 50_000;
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.turbo', 'dist', 'build',
  'coverage', '.cache', '__pycache__', 'vendor', '.venv', 'venv',
  'target', '.idea', '.vscode', '.git', '.github/workflows',
]);

const LANG_EXTS: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.php': 'php',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.c': 'c', '.cpp': 'c++',
  '.h': 'c', '.hpp': 'c++', '.cs': 'csharp', '.vue': 'vue', '.svelte': 'svelte',
  '.elm': 'elm', '.ex': 'elixir', '.exs': 'elixir', '.clj': 'clojure',
};

const FRAMEWORK_SIGNALS: Record<string, string[]> = {
  'next.config.': ['nextjs'],
  'svelte.config.': ['sveltekit'],
  'nuxt.config.': ['nuxt'],
  'remix.config.': ['remix'],
  'astro.config.': ['astro'],
  'gatsby-config.': ['gatsby'],
  'angular.json': ['angular'],
  'ember-cli-build.js': ['ember'],
  'wrangler.toml': ['cloudflare-workers'],
};

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readTextSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function isDirectory(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)].sort();
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < MAX_FILES) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      const fp = join(dir, e);
      const rp = relative(root, fp);
      if (isDirectory(fp)) {
        if (!SKIP_DIRS.has(e)) stack.push(fp);
      } else {
        files.push(rp);
      }
    }
  }
  return files;
}

function detectLanguages(files: string[]): string[] {
  const langs = new Set<string>();
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (LANG_EXTS[ext]) langs.add(LANG_EXTS[ext]);
  }
  return unique([...langs]);
}

function detectFrameworksFromFiles(files: string[]): string[] {
  const fws = new Set<string>();
  for (const f of files) {
    const bn = basename(f);
    for (const [prefix, labels] of Object.entries(FRAMEWORK_SIGNALS)) {
      if (bn.startsWith(prefix)) {
        for (const l of labels) fws.add(l);
      }
    }
  }
  return unique([...fws]);
}

function detectRuntimes(files: string[], root: string): RuntimeInfo[] {
  const runtimes: RuntimeInfo[] = [];

  const pkgJson = files.find(f => f === 'package.json');
  if (pkgJson) {
    const json = readJsonSafe(join(root, pkgJson));
    if (json?.engines && typeof json.engines === 'object') {
      const engines = json.engines as Record<string, string>;
      for (const [k, v] of Object.entries(engines)) {
        runtimes.push({ kind: k, version: v, source: 'engines' });
      }
    }
  }

  const pyproject = files.find(f => f === 'pyproject.toml');
  if (pyproject) {
    const content = readTextSafe(join(root, pyproject));
    if (content) {
      const m = content.match(/requires-python\s*=\s*["']([^"']+)["']/);
      if (m) runtimes.push({ kind: 'python', version: m[1], source: 'pyproject.toml' });
    }
  }

  const goMod = files.find(f => f === 'go.mod');
  if (goMod) {
    const content = readTextSafe(join(root, goMod));
    if (content) {
      const m = content.match(/^go\s+(\S+)/m);
      if (m) runtimes.push({ kind: 'go', version: m[1], source: 'go.mod' });
    }
  }

  for (const f of files) {
    const bn = basename(f);
    if (bn === '.nvmrc') {
      const v = readTextSafe(join(root, f))?.trim() ?? null;
      runtimes.push({ kind: 'node', version: v, source: 'nvmrc' });
    }
    if (bn === '.python-version') {
      const v = readTextSafe(join(root, f))?.trim() ?? null;
      runtimes.push({ kind: 'python', version: v, source: 'python-version' });
    }
    if (bn === '.tool-versions') {
      const content = readTextSafe(join(root, f));
      if (content) {
        for (const line of content.split('\n')) {
          const [tool, ver] = line.trim().split(/\s+/);
          if (tool && ver) runtimes.push({ kind: tool, version: ver, source: 'tool-versions' });
        }
      }
    }
    if (bn === 'rust-toolchain.toml' || bn === 'rust-toolchain') {
      const content = readTextSafe(join(root, f));
      if (content) {
        const m = content.match(/channel\s*=\s*["']([^"']+)["']/);
        if (m) runtimes.push({ kind: 'rust', version: m[1], source: 'rust-toolchain' });
      }
    }
  }

  return runtimes;
}

function detectDeploy(files: string[]): DeployInfo {
  const targets: string[] = [];
  const configFiles: string[] = [];

  const deploySignals: Array<{ file: string; target: string }> = [
    { file: 'Procfile', target: 'heroku' },
    { file: 'app.json', target: 'heroku' },
    { file: 'fly.toml', target: 'fly.io' },
    { file: 'render.yaml', target: 'render' },
    { file: 'railway.toml', target: 'railway' },
    { file: 'netlify.toml', target: 'netlify' },
    { file: 'vercel.json', target: 'vercel' },
    { file: 'serverless.yml', target: 'serverless' },
    { file: '.github/workflows/deploy.yml', target: 'github-actions' },
    { file: '.github/workflows/deploy.yaml', target: 'github-actions' },
  ];

  for (const s of deploySignals) {
    if (files.some(f => f === s.file || f.endsWith(`/${s.file}`))) {
      targets.push(s.target);
      configFiles.push(s.file);
    }
  }

  for (const f of files) {
    const bn = basename(f);
    if (bn.startsWith('deploy') || bn.includes('deploy.yml') || bn.includes('deploy.yaml')) {
      if (!configFiles.includes(f)) configFiles.push(f);
    }
  }

  return { targets: unique(targets), configFiles: unique(configFiles) };
}

function detectCi(files: string[]): CiInfo {
  const systems: string[] = [];
  const configFiles: string[] = [];

  const ciSignals: Array<{ prefix: string; label: string }> = [
    { prefix: '.github/workflows/', label: 'github-actions' },
    { prefix: '.circleci/', label: 'circleci' },
    { prefix: '.gitlab-ci', label: 'gitlab-ci' },
    { prefix: 'Jenkinsfile', label: 'jenkins' },
    { prefix: '.travis.yml', label: 'travis' },
    { prefix: '.drone.yml', label: 'drone' },
    { prefix: 'bitbucket-pipelines.yml', label: 'bitbucket' },
  ];

  for (const f of files) {
    for (const s of ciSignals) {
      if (f === s.prefix || f.startsWith(s.prefix)) {
        systems.push(s.label);
        configFiles.push(f);
      }
    }
  }

  return { systems: unique(systems), configFiles: unique(configFiles) };
}

function detectCdn(files: string[], root: string): CdnInfo {
  const networks: string[] = [];
  const frameworks: string[] = [];
  let staticBuildOutput: string | null = null;
  const evidence: string[] = [];

  for (const f of files) {
    const bn = basename(f);
    if (bn === 'netlify.toml') { networks.push('netlify'); evidence.push(f); }
    if (bn === 'vercel.json') { networks.push('vercel'); evidence.push(f); }
    if (bn === '_redirects') { networks.push('netlify'); evidence.push(f); }
    if (bn === '_headers') { networks.push('netlify'); evidence.push(f); }
    if (bn === 'wrangler.toml') { networks.push('cloudflare'); frameworks.push('workers'); evidence.push(f); }
  }

  for (const f of files) {
    const bn = basename(f);
    const dn = basename(dirname(f));
    if ((dn === 'dist' || dn === 'build' || dn === 'out') &&
        (bn === 'index.html' || bn === 'index.htm')) {
      staticBuildOutput = dn;
      evidence.push(f);
    }
  }

  return { networks: unique(networks), frameworks: unique(frameworks), staticBuildOutput, evidence: unique(evidence) };
}

function computeConfidence(manifest: ProjectIntelligenceManifest): number {
  let score = 0;
  if (manifest.languages.length > 0) score += 0.2;
  if (manifest.frameworks.length > 0) score += 0.15;
  if (manifest.packageManagers.length > 0) score += 0.15;
  if (manifest.dependencies.length > 0) score += 0.15;
  if (manifest.runtimes.length > 0) score += 0.1;
  if (manifest.services.length > 0) score += 0.1;
  if (manifest.scripts.build.length > 0 || manifest.scripts.start.length > 0) score += 0.1;
  if (manifest.ci.systems.length > 0 || manifest.deploy.targets.length > 0) score += 0.05;
  return Math.round(Math.min(1, score) * 100) / 100;
}

function buildSummary(manifest: ProjectIntelligenceManifest): string {
  const parts: string[] = [];
  if (manifest.languages.length > 0) parts.push(manifest.languages.join(', '));
  if (manifest.frameworks.length > 0) parts.push(manifest.frameworks[0]);
  if (manifest.packageManagers.length > 0) parts.push(manifest.packageManagers.join(' + '));
  if (manifest.services.length > 0) {
    parts.push(`${manifest.services.length} service${manifest.services.length > 1 ? 's' : ''}`);
  }
  return parts.join(' | ') || 'empty project';
}

export function buildManifest(
  workspace: Workspace,
  detection?: DetectionResult,
): ProjectIntelligenceManifest {
  const root = workspace.importPath;
  const projectRoot = root;
  const files = collectFiles(projectRoot);

  const languages = detectLanguages(files);
  const frameworks = detectFrameworksFromFiles(files);
  const runtimes = detectRuntimes(files, projectRoot);

  const depResults: DependencyInfo[] = [];
  const pkgMgrs: Set<string> = new Set();
  const resolvedManifests = new Set<string>();

  function addDeps(d: DependencyInfo | null) {
    if (!d || d.direct.length === 0) return;
    const key = `${d.manager}:${d.packageManifestPath}`;
    if (resolvedManifests.has(key)) return;
    resolvedManifests.add(key);
    depResults.push(d);
    pkgMgrs.add(d.manager);
  }

  addDeps(resolveNpm(files, projectRoot));
  addDeps(resolveBun(files, projectRoot));
  addDeps(resolvePnpm(files, projectRoot));
  addDeps(resolvePip(files, projectRoot));
  addDeps(resolveCargo(files, projectRoot));
  addDeps(resolveGo(files, projectRoot));

  const scripts = detectScripts(files, projectRoot);
  const env = detectEnv(files, projectRoot);
  const services = detectServices(files, projectRoot);

  const deploy = detectDeploy(files);
  const ci = detectCi(files);
  const cdn = detectCdn(files, projectRoot);

  const pkgCount = files.filter(f => basename(f) === 'package.json').length;

  const manifest: ProjectIntelligenceManifest = {
    workspaceId: workspace.workspaceId,
    detectedAt: new Date().toISOString(),
    summary: '',
    languages: unique(languages),
    frameworks: unique(frameworks),
    packageManagers: unique([...pkgMgrs]) as ProjectIntelligenceManifest['packageManagers'],
    dependencies: depResults,
    runtimes,
    scripts,
    env,
    services,
    cdn,
    deploy,
    ci,
    entryPoints: detection?.entryPoints ?? unique(files.filter(f => {
      const bn = basename(f);
      return bn === 'package.json' || bn === 'main.py' || bn === 'main.go' ||
             bn === 'index.ts' || bn === 'index.tsx' || bn === 'App.tsx' ||
             bn === 'index.js' || bn.endsWith('.test.ts') === false &&
             (bn.startsWith('main.') || bn.startsWith('index.'));
    }).slice(0, 10)),
    totalFiles: files.length,
    packageCount: pkgCount,
    confidence: 0,
  };

  manifest.summary = buildSummary(manifest);
  manifest.confidence = computeConfidence(manifest);

  return manifest;
}
