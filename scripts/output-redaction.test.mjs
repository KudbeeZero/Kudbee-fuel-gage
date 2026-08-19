#!/usr/bin/env node
/**
 * SEC-004 — Output Redaction Layer fixtures test.
 *
 * Verifies INV-016:
 *   - Every credential class is masked (API keys, bearer, JWT, DB/Redis URLs,
 *     cookies, authorization headers, secret fields)
 *   - Safe output passes through unchanged (0 masks)
 *   - redactOutput recurses through arrays/objects
 *   - redactString works for SSE/terminal frames
 *
 * Run: bun test scripts/output-redaction.test.mjs
 * ---------------------------------------------------------------------------
 */

import { test, expect } from 'bun:test';
import { redactOutput, redactString } from '../services/lib/outputRedactor.ts';

// ─── Credential classes must be masked ─────────────────────────────────────

test('API key (sk-) is masked', () => {
  const r = redactString('key=sk-proj-EXAMPLE-abcdefghijklmnopqrstuvwxyz');
  expect(r.redacted).toContain('[REDACTED:api-key]');
  expect(r.redacted).not.toContain('sk-proj-');
  expect(r.count).toBeGreaterThan(0);
});

test('GitHub token (ghp_) is masked', () => {
  const r = redactString('token ghp_abcdefghijklmnopqrstuvwxyz1234567890');
  expect(r.redacted).toContain('[REDACTED:github-token]');
  expect(r.redacted).not.toContain('ghp_');
});

test('Bearer token is masked', () => {
  const r = redactString('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  expect(r.redacted).toContain('[REDACTED:bearer-token]');
});

test('JWT is masked', () => {
  const r = redactString('jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl');
  expect(r.redacted).toContain('[REDACTED:jwt]');
});

test('Database URL with credentials is masked', () => {
  const r = redactString('postgresql://admin:SuperSecret123@host:5432/db');
  expect(r.redacted).toContain('[REDACTED:database-url]');
  expect(r.redacted).not.toContain('SuperSecret123');
});

test('Redis URL with credentials is masked', () => {
  const r = redactString('redis://default:hunter2secret@redis.example.com:6379');
  expect(r.redacted).toContain('[REDACTED:redis-url]');
  expect(r.redacted).not.toContain('hunter2secret');
});

test('Authorization header value is masked', () => {
  const r = redactString('authorization: abcdefghijklmnopqrstuvwxyz1234567890');
  expect(r.redacted).toContain('[REDACTED:authorization-header]');
});

// ─── Field-name redaction ──────────────────────────────────────────────────

test('secret-named fields are masked (apiKey, token, secret)', () => {
  const r = redactOutput({ apiKey: 'my-secret-key', safe: 'visible', nested: { token: 'x'.repeat(20) } });
  expect(r.redacted).toEqual({
    apiKey: '[REDACTED:field]',
    safe: 'visible',
    nested: { token: '[REDACTED:field]' },
  });
  expect(r.count).toBe(2);
});

// ─── Safe output passes through ────────────────────────────────────────────

test('safe output is unchanged (0 masks)', () => {
  const r = redactOutput({
    status: 'ok',
    agents: [{ id: 'hermes', online: true }],
    message: 'All systems operational',
  });
  expect(r.count).toBe(0);
  expect(r.redacted).toEqual({ status: 'ok', agents: [{ id: 'hermes', online: true }], message: 'All systems operational' });
});

test('engineering output without secrets passes clean', () => {
  const r = redactString('Deploy v148 passed boot-verify. Dependencies healthy.');
  expect(r.count).toBe(0);
  expect(r.redacted).toBe('Deploy v148 passed boot-verify. Dependencies healthy.');
});

// ─── Structure recursion ───────────────────────────────────────────────────

test('arrays are recursed', () => {
  const r = redactOutput(['plain', 'sk-ant-EXAMPLE-123456']);
  expect(r.redacted[0]).toBe('plain');
  expect(r.redacted[1]).toContain('[REDACTED:api-key]');
});

// ─── Terminal frame safety ─────────────────────────────────────────────────

test('redactString masks credentials in terminal output', () => {
  const frame = 'USER: sk-proj-EXAMPLE-123456 | DB: postgresql://u:p@db:5432/x';
  const r = redactString(frame);
  expect(r.redacted).not.toContain('sk-proj-');
  expect(r.redacted).not.toContain('u:p@');
  expect(r.count).toBeGreaterThanOrEqual(2);
});
