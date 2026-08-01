#!/usr/bin/env node
/** Low-capability-safe governance checks for model task execution. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/phase/next/governance-policy.json'), 'utf8'));
const taskFiles = {
  'deepseek-v4': 'config/phase/next/deepseek-v4.tasks.json',
  'qwen-3.6-pro': 'config/phase/next/qwen-3.6-pro.tasks.json',
};

function fail(message) {
  console.error(`[governor] FAIL: ${message}`);
  process.exitCode = 1;
}

function findTask(model, taskId) {
  const file = taskFiles[model];
  if (!file) return null;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  return manifest.tasks.find((task) => task.id === taskId) || null;
}

function checkTask(model, taskId) {
  const task = findTask(model, taskId);
  if (!task) return fail(`unknown model/task: ${model} ${taskId}`);
  const errors = [];
  if (!task.title || !task.priority || !Array.isArray(task.scope) || task.scope.length === 0) errors.push('task must have title, priority, and bounded scope');
  if (!Array.isArray(task.deliverables) || task.deliverables.length === 0) errors.push('task must define deliverables');
  if (!Array.isArray(task.requiredChecks) || task.requiredChecks.length === 0) errors.push('task must define required checks');
  for (const file of task.scope) {
    if (!file.includes('*') && !fs.existsSync(path.join(root, file))) errors.push(`scope path missing: ${file}`);
  }
  const taskText = `${task.title} ${task.scope.join(' ')} ${task.deliverables.join(' ')}`.toLowerCase();
  const approvalRequired = policy.humanApprovalKeywords.some((keyword) => taskText.includes(keyword));
  if (approvalRequired && task.humanApproval !== true) errors.push('task touches a human-approval keyword but humanApproval is false');
  if (errors.length) return fail(`${model} ${taskId}: ${errors.join('; ')}`);
  console.log(`[governor] PASS: ${model} ${taskId}`);
  console.log(`  scope: ${task.scope.join(', ')}`);
  console.log(`  checks: ${task.requiredChecks.join(', ')}`);
  console.log(`  human approval: ${task.humanApproval ? 'required' : 'not required'}`);
}

function checkReport(file) {
  if (!file || !fs.existsSync(path.join(root, file))) return fail(`report missing: ${file || '(none)'}`);
  const report = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const missing = policy.requiredReportFields.filter((field) => report[field] === undefined || report[field] === null);
  if (missing.length) return fail(`report missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(report.changedFiles) || !Array.isArray(report.commands)) return fail('changedFiles and commands must be arrays');
  if (!['PASS', 'BLOCKED', 'FAILED'].includes(report.status)) return fail('status must be PASS, BLOCKED, or FAILED');
  console.log(`[governor] PASS: report ${file}`);
}

const command = process.argv[2];
if (command === 'check') checkTask(process.argv[3], process.argv[4]);
else if (command === 'report') checkReport(process.argv[3]);
else {
  console.log('Usage: node scripts/phase-governor.mjs check <model> <task-id> | report <report.json>');
  process.exitCode = 1;
}
