#!/usr/bin/env node
/**
 * Print a deterministic task packet for the next model phase.
 *
 * Usage:
 *   node scripts/model-task-packet.mjs deepseek-v4 DS-01
 *   node scripts/model-task-packet.mjs qwen-3.6-pro QW-02
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const model = process.argv[2];
const taskId = process.argv[3];
const files = {
  'deepseek-v4': 'config/phase/next/deepseek-v4.tasks.json',
  'qwen-3.6-pro': 'config/phase/next/qwen-3.6-pro.tasks.json',
};

function fail(message) {
  console.error(`[task-packet] ${message}`);
  process.exitCode = 1;
}

if (!model || !taskId || !files[model]) {
  fail('usage: node scripts/model-task-packet.mjs <deepseek-v4|qwen-3.6-pro> <task-id>');
} else {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, files[model]), 'utf8'));
  const task = manifest.tasks.find((item) => item.id === taskId);
  if (!task) {
    fail(`unknown task ${taskId} for ${model}`);
  } else {
    console.log(JSON.stringify({
      phase: 'security-durability-foundation',
      model,
      role: manifest.role,
      task,
      rules: [
        'Use a dedicated worktree.',
        'Do not modify production secrets.',
        'Do not claim verification without current command output.',
        'Return changed files, evidence, risks, and rollback steps.',
      ],
    }, null, 2));
  }
}
