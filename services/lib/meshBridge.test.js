import { test, expect } from 'bun:test';
import { isStructuredToolTask, validateToolRequest } from './meshBridge.js';

test('isStructuredToolTask recognizes a tool task', () => {
  expect(isStructuredToolTask({ tool: 'git.status', arguments: {} })).toBe(true);
  expect(isStructuredToolTask({ action: 'tool', tool: 'git.status' })).toBe(true);
  expect(isStructuredToolTask({ prompt: 'check repo' })).toBe(false);
  expect(isStructuredToolTask(null)).toBe(false);
});

test('validateToolRequest accepts a valid structured ToolRequest', () => {
  expect(validateToolRequest({ tool: 'git.status', arguments: {} }).ok).toBe(true);
  expect(validateToolRequest({ tool: 'project.check', arguments: { file: 'x.js' } }).ok).toBe(true);
});

test('validateToolRequest rejects raw command / shell / exec / script / process / cmd / environment', () => {
  expect(validateToolRequest({ tool: 'x', arguments: {}, command: 'rm -rf /' }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { shell: 'whoami' } }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { exec: 'ls' } }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { script: '...' } }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { process: 'node' } }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { cmd: 'pwd' } }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'x', arguments: { environment: { PATH: '/tmp' } } }).ok).toBe(false);
});

test('validateToolRequest requires tool and object arguments', () => {
  expect(validateToolRequest(null).ok).toBe(false);
  expect(validateToolRequest({ arguments: {} }).ok).toBe(false);
  expect(validateToolRequest({ tool: 'git.status', arguments: 'nope' }).ok).toBe(false);
});
