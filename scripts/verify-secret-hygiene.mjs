#!/usr/bin/env node
/**
 * Secret hygiene gate.
 *
 * It reports secret names and presence only. It never prints values, reads
 * values from Redis, or persists credentials to memory, DTHINK, or artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

try { process.loadEnvFile('.env'); } catch {}

const root = process.cwd();
const manifestPath = path.join(root, 'config/secrets/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const strict = process.argv.includes('--strict') || process.env.SECRET_HYGIENE_STRICT === '1';
const production = process.env.NODE_ENV === 'production';
const failures = [];
const warnings = [];

const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const warn = (id, detail) => {
  warnings.push(`${id}: ${detail}`);
  console.warn(`[WARN] ${id}: ${detail}`);
};
const fail = (id, detail) => {
  failures.push(`${id}: ${detail}`);
  console.error(`[FAIL] ${id}: ${detail}`);
};

if (manifest.policy?.valuesStoredInRepository !== false || manifest.policy?.valuesStoredInRedis !== false) {
  fail('policy', 'secret values must not be stored in repository or Redis');
} else if (manifest.policy?.valuesPrintedToLogs !== false) {
  fail('policy', 'secret values must not be printed to logs');
} else {
  pass('policy', 'secret values are environment-only and presence checks are name-only');
}

const names = new Set();
for (const entry of manifest.secrets || []) {
  if (!entry.name || names.has(entry.name)) fail('manifest', `duplicate or missing secret name: ${entry.name || '(missing)'}`);
  names.add(entry.name);
  const configured = Boolean(process.env[entry.name]);
  const required = Boolean(entry.requiredInProduction && (production || strict));
  if (configured) pass(`secret:${entry.name}`, 'configured (value withheld)');
  else if (required) fail(`secret:${entry.name}`, 'required but not configured');
  else warn(`secret:${entry.name}`, 'not configured (value not requested or printed)');
}

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean);
const allowedExamples = new Set(['config/template.env', 'config/.env.example', '.env.example', 'scripts/secret-hygiene.test.mjs']);
const trackedEnvFiles = tracked.filter((file) => {
  const base = path.basename(file);
  return (base === '.env' || base.startsWith('.env.')) && !allowedExamples.has(file);
});
if (trackedEnvFiles.length) fail('tracked-env', `${trackedEnvFiles.length} populated environment file(s) are tracked`);
else pass('tracked-env', 'no populated environment files are tracked');

// ─── Credential URL detection (STAB-005) ───────────────────────────────────
// Phase 4 rule: secret scanners must detect actual secrets, not placeholder
// syntax used for templates/code generation. Three categories:
//   PASS — both user/pass are environment placeholders (${VAR}, <VAR>,
//          %VAR%, process.env.VAR, env.VAR) → template, not a secret.
//   WARN — placeholders reference UNKNOWN variable names → review required.
//   FAIL — any segment is a literal value → real credential.
const PLACEHOLDER = /^(?:\$\{([^}]+)\}|<([A-Za-z_][A-Za-z0-9_]*)>|%([A-Za-z_][A-Za-z0-9_]*)%|(?:process\.env|env)\.([A-Za-z_][A-Za-z0-9_]*))$/;
const KNOWN_ENV_VARS = new Set((manifest.secrets || []).map((s) => s.name));
// Generic suffix names that are always template-shaped regardless of prefix.
const GENERIC_PLACEHOLDER_NAMES = new Set([
  'TOKEN', 'PASSWORD', 'PASS', 'USER', 'HOST', 'DB', 'URL', 'KEY', 'SECRET', 'API_KEY', 'NAME',
  'USERNAME', 'LOGIN', 'CREDENTIAL', 'CREDENTIALS', 'AUTH',
]);

function classifySegment(segment) {
  const m = segment.match(PLACEHOLDER);
  if (!m) return { kind: 'literal', value: segment };
  const name = (m[1] || m[2] || m[3] || m[4] || '').toUpperCase();
  // Known secret names, OR any name ending in a generic credential suffix
  // (REDIS_PASSWORD, API_SECRET, DB_USER, MY_TOKEN, ...) → placeholder.
  const isGeneric = [...GENERIC_PLACEHOLDER_NAMES].some((suffix) => name === suffix || name.endsWith(`_${suffix}`));
  if (KNOWN_ENV_VARS.has(name) || isGeneric) {
    return { kind: 'placeholder', name };
  }
  return { kind: 'unknown', name };
}

/**
 * Classify a credential-shaped URL's user/password segments.
 * Returns 'pass' | 'warn' | 'fail'.
 */
function classifyCredentialUrl(user, pass) {
  const u = classifySegment(user);
  const p = classifySegment(pass);
  const kinds = [u.kind, p.kind];

  // Both placeholders → PASS (template).
  if (kinds.every((k) => k === 'placeholder')) return 'pass';
  // One or both unknown vars → WARN (review, don't block).
  if (kinds.some((k) => k === 'unknown') && !kinds.includes('literal')) return 'warn';
  // Any literal → FAIL (real credential).
  return 'fail';
}

function findCredentialUrls(content) {
  // Matches scheme://user:pass@ and inspects the segments semantically.
  const urlPattern = /\b(?:postgres(?:ql)?|redis(?:s)?|mysql|mongo(?:db)?(?:\+srv)?):\/\/([^\s:@/]+):([^\s@/]+)@/g;
  const found = [];
  let m;
  while ((m = urlPattern.exec(content)) !== null) {
    found.push({ user: m[1], pass: m[2], verdict: classifyCredentialUrl(m[1], m[2]) });
  }
  return found;
}

const patterns = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
  ['provider-token', /\b(?:sk-(?:proj|ant)-|gsk_|AIza)[A-Za-z0-9_-]{16,}/],
  ['cloud-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['long-bearer', /\bBearer\s+[A-Za-z0-9._-]{32,}/i],
];
const scanFiles = tracked.filter((file) => {
  if (file.startsWith('.worktrees/') || file.startsWith('node_modules/') || file.startsWith('.git/')) return false;
  // Allowed example files are documentation templates, not real environments.
  if (allowedExamples.has(file) || file.endsWith('.lock') || file.endsWith('.jsonl')) return false;
  try { return fs.statSync(path.join(root, file)).size <= 2_000_000; } catch { return false; }
});
const leaks = [];
for (const file of scanFiles) {
  let content;
  try { content = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) leaks.push(`${file}:${label}`);
  }
  for (const { user, verdict } of findCredentialUrls(content)) {
    if (verdict === 'fail') leaks.push(`${file}:credential-url:${user.slice(0, 24)}:${verdict}`);
    else if (verdict === 'warn') warn('credential-url:unknown', `${file}: placeholder references unknown env var (${user}) — verify it is a template`);
  }
}
if (leaks.length) fail('tracked-content', `${leaks.length} possible credential pattern(s) found; values withheld`);
else pass('tracked-content', 'no credential patterns found in tracked source files');

console.log(`\nSecret hygiene: ${failures.length ? 'BLOCKED' : 'READY'}; ${warnings.length} warnings; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
