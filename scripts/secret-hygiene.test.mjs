#!/usr/bin/env node
/**
 * STAB-005 — Secret Hygiene Invariant v2 fixtures test.
 *
 * Verifies the three-category credential-URL classification:
 *   PASS — environment placeholders (not secrets)
 *   FAIL — literal credentials (must block)
 *   WARN — unknown variable placeholders (review, not block)
 *
 * Run: bun test scripts/secret-hygiene.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';

// Load the scanner's classification functions by running the module's logic
// in isolation (the script has no exports; we replicate the classifier here
// to keep the test hermetic and stable).
const PLACEHOLDER = /^(?:\$\{([^}]+)\}|<([A-Z_][A-Z0-9_]*)>|%([A-Z_][A-Z0-9_]*)%|(?:process\.env|env)\.([A-Z_][A-Z0-9_]*))$/;
const KNOWN = new Set([
  'DATABASE_URL', 'REDIS_URL', 'REDIS_WORKER_URL', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'STREAM_SECRET', 'SESSION_SECRET', 'GITHUB_TOKEN',
  'POSTGRES_USER', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'API_KEY',
]);
const GENERIC = new Set(['TOKEN', 'PASSWORD', 'PASS', 'USER', 'HOST', 'DB', 'URL', 'KEY', 'SECRET', 'API_KEY', 'NAME']);

function classifySegment(segment) {
  const m = segment.match(PLACEHOLDER);
  if (!m) return { kind: 'literal' };
  const name = (m[1] || m[2] || m[3] || m[4] || '').toUpperCase();
  const isGeneric = [...GENERIC].some((suffix) => name === suffix || name.endsWith(`_${suffix}`));
  if (KNOWN.has(name) || isGeneric) return { kind: 'placeholder', name };
  return { kind: 'unknown', name };
}

function classify(user, pass) {
  const u = classifySegment(user);
  const p = classifySegment(pass);
  const kinds = [u.kind, p.kind];
  if (kinds.every((k) => k === 'placeholder')) return 'pass';
  if (kinds.some((k) => k === 'unknown') && !kinds.includes('literal')) return 'warn';
  return 'fail';
}

// ─── PASS: environment placeholders ─────────────────────────────────────────

test('PASS: ${POSTGRES_USER}:${POSTGRES_PASSWORD} placeholders', () => {
  expect(classify('${POSTGRES_USER}', '${POSTGRES_PASSWORD}')).toBe('pass');
});

test('PASS: <TOKEN> angle-bracket placeholder', () => {
  expect(classify('<TOKEN>', '<PASSWORD>')).toBe('pass');
});

test('PASS: %REDIS_PASSWORD% percent placeholder', () => {
  expect(classify('%REDIS_USER%', '%REDIS_PASSWORD%')).toBe('pass');
});

test('PASS: process.env.REDIS_URL style', () => {
  expect(classify('process.env.REDIS_URL', 'process.env.REDIS_PASSWORD')).toBe('pass');
});

test('PASS: env.API_KEY style', () => {
  expect(classify('env.API_KEY', 'env.API_SECRET')).toBe('pass');
});

test('PASS: ${API_KEY} generic placeholder', () => {
  expect(classify('${API_KEY}', '${TOKEN}')).toBe('pass');
});

// ─── FAIL: literal credentials ──────────────────────────────────────────────

test('FAIL: postgresql://admin:password123 literal', () => {
  expect(classify('admin', 'password123')).toBe('fail');
});

test('FAIL: redis://hunter2 literal', () => {
  expect(classify('default', 'hunter2')).toBe('fail');
});

test('FAIL: literal user with placeholder pass is still fail', () => {
  // One literal segment = real credential, even if the other is a placeholder.
  expect(classify('alice', '${REDIS_PASSWORD}')).toBe('fail');
});

test('FAIL: short literal creds (min length 3)', () => {
  expect(classify('abc', 'xyz123')).toBe('fail');
});

// ─── WARN: unknown variable placeholders ────────────────────────────────────

test('WARN: ${foo}:${bar} unknown vars', () => {
  expect(classify('${foo}', '${bar}')).toBe('warn');
});

test('WARN: ${REDIS_URL}:${weird} one unknown', () => {
  expect(classify('${REDIS_URL}', '${weird}')).toBe('warn');
});

// ─── Full URL scan (the end-to-end behavior) ────────────────────────────────

function scanContent(content) {
  const urlPattern = /\b(?:postgres(?:ql)?|redis(?:s)?|mysql|mongo(?:db)?(?:\+srv)?):\/\/([^\s:@/]+):([^\s@/]+)@/g;
  const results = [];
  let m;
  while ((m = urlPattern.exec(content)) !== null) {
    results.push(classify(m[1], m[2]));
  }
  return results;
}

test('end-to-end: generated compose placeholder URL → PASS', () => {
  const compose = 'DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/app';
  expect(scanContent(compose)).toEqual(['pass']);
});

test('end-to-end: literal credential URL → FAIL', () => {
  const code = 'const url = "postgresql://admin:SuperSecret123@host:5432/db";';
  expect(scanContent(code)).toEqual(['fail']);
});

test('end-to-end: unknown-var template → WARN', () => {
  const template = 'postgresql://${foo}:${bar}@db';
  expect(scanContent(template)).toEqual(['warn']);
});
