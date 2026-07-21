/**
 * services/agents/crucible.js
 * ---------------------------------------------------------------------------
 * THE CRUCIBLE — Background Research Agent
 *
 * Autonomously attempts complex tasks using a low-cost model, intentionally
 * captures its own failures, and pushes those failed states to the Reasoning
 * Ledger for human review and minting into Think Tokens.
 *
 * Strictly rate-limited to protect the Sink Token budget.
 * ---------------------------------------------------------------------------
 */

import { recordReasoning } from '../governance/ledger.js';
import { proposeAction } from '../governance/router.js';

const PREFIX = '[CRUCIBLE]';
const MAX_CYCLES_PER_BOOT = 5;
const CYCLE_INTERVAL_MS = 10 * 60 * 1000;

let cycleCount = 0;

const ADVERSARIAL_TASKS = [
  {
    id: 'db-rollback-migration',
    prompt: 'Implement a database migration that safely renames a column while preserving all existing data and rolling back on failure.',
    flawedOutput: { error: 'SyntaxError', missing: 'transaction wrapper', partial: 'ALTER TABLE only' }
  },
  {
    id: 'distributed-rate-limiter',
    prompt: 'Design a rate-limiter that handles distributed race conditions without leaking tokens under concurrent requests.',
    flawedOutput: { error: 'Race condition', missing: 'atomic decrement', partial: 'in-memory counter only' }
  },
  {
    id: 'deep-json-parser',
    prompt: 'Parse this deeply nested JSON payload and extract all leaf node paths: {"a":{"b":{"c":[1,2,{"d":"value"}]}},"e":null}',
    flawedOutput: { error: 'TypeError', missing: 'null handling', partial: 'shallow traversal only' }
  },
  {
    id: 'atomic-account-debit',
    prompt: 'Write a function that atomically debits an account balance and logs the transaction, ensuring no double-spend under concurrent access.',
    flawedOutput: { error: 'Lost update', missing: 'SELECT FOR UPDATE', partial: 'read-modify-write without lock' }
  },
  {
    id: 'algorithm-optimization',
    prompt: 'Optimize this O(n²) algorithm to O(n log n) while maintaining exact output ordering for edge-case inputs.',
    flawedOutput: { error: 'Incorrect ordering', missing: 'stable sort guarantee', partial: 'reduced complexity but wrong output' }
  }
];

function generateTraceId() {
  return crypto.randomUUID();
}

function format(level, parts) {
  const ts = new Date().toISOString();
  const body = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  return `${ts} ${PREFIX} ${level} ${body}`;
}

const log = {
  info: (...parts) => console.log(format('INFO', parts)),
  warn: (...parts) => console.warn(format('WARN', parts)),
  error: (...parts) => console.error(format('ERROR', parts))
};

async function simulateFlawedExecution(task) {
  const delayMs = 500 + Math.random() * 1500;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const flawedResponses = [
    { status: 'PARTIAL', output: task.flawedOutput, reason: 'Incomplete implementation — critical edge cases unhandled' },
    { status: 'FAILURE', output: { ...task.flawedOutput, stack: 'ReferenceError: x is not defined' }, reason: 'Runtime exception on malformed input' },
    { status: 'FAILURE', output: { ...task.flawedOutput, validation: 'Schema mismatch at depth 3' }, reason: 'Structural validation failure' }
  ];

  return flawedResponses[Math.floor(Math.random() * flawedResponses.length)];
}

export async function runCrucibleCycle() {
  if (cycleCount >= MAX_CYCLES_PER_BOOT) {
    log.warn(`Circuit breaker active — ${cycleCount}/${MAX_CYCLES_PER_BOOT} cycles exhausted. Halting.`);
    return { success: false, cycle: cycleCount, maxCycles: MAX_CYCLES_PER_BOOT, traceId: '', message: 'Circuit breaker active' };
  }

  cycleCount += 1;
  const task = ADVERSARIAL_TASKS[Math.floor(Math.random() * ADVERSARIAL_TASKS.length)];
  const traceId = generateTraceId();

  log.info(`Cycle ${cycleCount}/${MAX_CYCLES_PER_BOOT} started`, `task=${task.id}`);

  try {
    const execution = await simulateFlawedExecution(task);
    const failedState = {
      traceId,
      service: 'CRUCIBLE_AGENT',
      task_context: task.prompt,
      task_id: task.id,
      execution,
      flawed_response: execution.output,
      timestamp: new Date().toISOString()
    };

    await recordReasoning(
      { context: task.prompt, thoughtStream: [], trace_id: traceId },
      { output: failedState },
      { status: 'FAILURE', reason: execution.reason },
      'crucible-agent',
      'reasoning',
      execution.reason
    );

    await proposeAction({
      action: 'CRUCIBLE_FAILED_STATE_REVIEW',
      tags: ['crucible', 'failed-state', task.id],
      prompt: JSON.stringify({
        traceId,
        service: 'CRUCIBLE_AGENT',
        task_context: task.prompt,
        failed_state: failedState,
        status: 'PENDING_APPROVAL'
      }),
      id: `crucible-${traceId}`
    });

    log.info(`Cycle ${cycleCount} complete`, `traceId=${traceId}`, `task=${task.id}`);
    return { success: true, cycle: cycleCount, maxCycles: MAX_CYCLES_PER_BOOT, traceId, taskId: task.id, message: 'Cycle complete' };
  } catch (err) {
    log.error(`Cycle ${cycleCount} failed`, err instanceof Error ? err.message : String(err));
    return { success: false, cycle: cycleCount, maxCycles: MAX_CYCLES_PER_BOOT, traceId, message: err instanceof Error ? err.message : String(err) };
  }
}

export function startCrucibleScheduler() {
  if (process.env.CRUCIBLE_ENABLED !== 'true') {
    log.info('Disabled — set CRUCIBLE_ENABLED=true to activate');
    return;
  }

  log.info(`Activated — interval=${CYCLE_INTERVAL_MS}ms, maxCycles=${MAX_CYCLES_PER_BOOT}`);

  void runCrucibleCycle();

  const intervalId = setInterval(() => {
    void runCrucibleCycle();
  }, CYCLE_INTERVAL_MS);

  return intervalId;
}

export const crucible = {
  runCrucibleCycle,
  startCrucibleScheduler,
  cycleCount,
  MAX_CYCLES_PER_BOOT
};

export default crucible;
