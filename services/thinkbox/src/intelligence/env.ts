/**
 * Environment variable requirement detection.
 *
 * Scans .env.example, .env, and code files for required environment variables.
 * Never reads actual .env values — only detects their existence and categories.
 */

import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { EnvVarRequirement } from './types.ts';

function readTextSafe(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function categorize(varName: string): EnvVarRequirement['category'] {
  const upper = varName.toUpperCase();
  if (upper.includes('DATABASE') || upper.includes('DB_') || upper.includes('POSTGRES') ||
      upper.includes('MYSQL') || upper.includes('MONGO') || upper.includes('NEON') ||
      upper.includes('PG_')) return 'database';
  if (upper.includes('REDIS') || upper.includes('CACHE') || upper.includes('MEMCACHED') ||
      upper.includes('UPSTASH')) return 'cache';
  if (upper.includes('API_KEY') || upper.includes('APIKEY') || upper.includes('SECRET') ||
      upper.includes('TOKEN') || upper.includes('OPENAI') || upper.includes('GROQ') ||
      upper.includes('ANTHROPIC') || upper.includes('DEEPSEEK') || upper.includes('HUGGINGFACE') ||
      upper.includes('GEMINI') || upper.includes('COHERE') || upper.includes('UPSTASH_REDIS_REST')) return 'api-key';
  if (upper.includes('_URL') || upper.includes('ENDPOINT') || upper.includes('HOST') ||
      upper.includes('ORIGIN')) return 'url';
  if (upper.includes('AUTH') || upper.includes('JWT') || upper.includes('OAUTH') ||
      upper.includes('PASSPORT') || upper.includes('SESSION')) return 'auth';
  if (upper.includes('FEATURE') || upper.includes('FLAG') || upper.includes('DEBUG') ||
      upper.includes('LOG_') || upper.includes('NODE_ENV') || upper === 'CI' ||
      upper === 'VERBOSE') return 'feature';
  return 'other';
}

function parseEnvFile(content: string, source: '.env.example' | '.env', filename: string): EnvVarRequirement[] {
  const vars: EnvVarRequirement[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    let name = trimmed.substring(0, eqIdx).trim();
    if (name.startsWith('export ')) name = name.substring(7);

    const isRequired = !trimmed.includes('#optional') &&
                       !trimmed.includes('OPTIONAL') &&
                       !trimmed.includes('(optional)');
    const comment = trimmed.includes('#')
      ? trimmed.substring(trimmed.indexOf('#') + 1).trim().toLowerCase()
      : '';

    vars.push({
      name,
      source,
      required: isRequired && !comment.includes('optional'),
      category: categorize(name),
    });
  }
  return vars;
}

function extractFromSource(files: string[], root: string): EnvVarRequirement[] {
  const vars: EnvVarRequirement[] = [];
  const codeFiles = files.filter(f => {
    const ext = f.split('.').pop()?.toLowerCase();
    return ext && ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'rb'].includes(ext);
  }).slice(0, 200);

  const envPattern = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b/g;
  const pythonEnv = /\bos\.environ\.get\(["']([A-Z_][A-Z0-9_]*)["']\)/g;
  const pythonEnv2 = /\bos\.environ\[["']([A-Z_][A-Z0-9_]*)["']\]/g;

  const found = new Set<string>();

  for (const f of codeFiles) {
    const content = readTextSafe(join(root, f));
    if (!content) continue;

    for (const m of content.matchAll(envPattern)) {
      found.add(m[1]);
    }
    for (const m of content.matchAll(pythonEnv)) {
      found.add(m[1]);
    }
    for (const m of content.matchAll(pythonEnv2)) {
      found.add(m[1]);
    }
  }

  for (const name of found) {
    vars.push({
      name,
      source: 'code',
      required: true,
      category: categorize(name),
    });
  }

  return vars;
}

export function detectEnv(files: string[], root: string): EnvVarRequirement[] {
  const all: EnvVarRequirement[] = [];

  for (const f of files) {
    const bn = basename(f);
    if (bn === '.env.example') {
      const content = readTextSafe(join(root, f));
      if (content) all.push(...parseEnvFile(content, '.env.example', f));
    }
    if (bn === '.env' && !f.includes('node_modules')) {
      const content = readTextSafe(join(root, f));
      if (content) all.push(...parseEnvFile(content, '.env', f));
    }
  }

  all.push(...extractFromSource(files, root));

  const seen = new Set<string>();
  return all.filter(v => {
    const key = v.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
