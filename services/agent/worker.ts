/**
 * services/agent/worker.ts
 * ---------------------------------------------------------------------------
 * Isolated Worker thread script.
 *
 * Each worker:
 *  1. Receives a SubTask via parentPort.on('message', ...)
 *  2. Calls the local Ollama API at http://localhost:11434/api/chat
 *  3. Captures <think> blocks from streaming responses
 *  4. Posts progress / think / result / error messages back to the main thread
 *
 * This runs in a separate V8 isolate — no shared mutable state with the
 * orchestrator or other workers.
 */

import { parentPort } from 'node:worker_threads';
import type { SubTask, WorkerMessage, TaskResult } from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

function post(msg: WorkerMessage): void {
  parentPort?.postMessage(msg);
}

function now(): string {
  return new Date().toISOString();
}

// ── Think-block extraction ─────────────────────────────────────────────────

/**
 * Extracts all <think>...</think> blocks from the accumulated Ollama stream.
 * Returns visible text (content *not* inside think tags) and the concatenated
 * think content.
 */
function partitionThinking(raw: string): { visible: string; thinking: string } {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkParts: string[] = [];
  let visible = raw;

  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(raw)) !== null) {
    thinkParts.push(match[1].trim());
  }

  // Remove all think blocks from visible text
  visible = visible.replace(thinkRegex, '').trim();

  return { visible, thinking: thinkParts.join('\n') };
}

// ── Ollama API call ────────────────────────────────────────────────────────

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
}

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
  created_at?: string;
  total_duration?: number;
}

async function callOllama(task: SubTask): Promise<TaskResult> {
  const startTime = Date.now();
  const roleMap: Record<string, string> = {
    CodeAnalyzer: 'You are a code analysis expert. Analyze code structure, patterns, and quality.',
    SecurityScanner: 'You are a security expert. Identify vulnerabilities, unsafe patterns, and security risks.',
    TestRunner: 'You are a testing expert. Design and evaluate test cases for correctness and coverage.',
    DependencyChecker: 'You are a dependency management expert. Audit dependencies for issues, licenses, and versions.',
    DocumentationGenerator: 'You are a documentation expert. Generate clear, concise documentation.',
    TypescriptValidator: 'You are a TypeScript expert. Validate types, interfaces, and strictness.',
  };

  const systemPrompt = roleMap[task.role] ?? 'You are a helpful AI assistant.';

  const body: OllamaChatRequest = {
    model: process.env.OLLAMA_MODEL ?? 'codellama:7b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.prompt },
    ],
    stream: true,
  };

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
  }

  let accumulated = '';

  // Stream the NDJSON response line by line
  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    try {
      const chunk: OllamaChatResponse = JSON.parse(line);

      if (chunk.message?.content) {
        accumulated += chunk.message.content;

        // Extract think blocks so far and post them as telemetry
        const { thinking } = partitionThinking(accumulated);

        if (thinking) {
          post({
            type: 'think',
            taskId: task.id,
            role: task.role,
            payload: { thinkingText: thinking, model: chunk.model },
            timestamp: now(),
          });

          // Also post progress
          post({
            type: 'progress',
            taskId: task.id,
            role: task.role,
            payload: { partial: chunk.message.content },
            timestamp: now(),
          });
        }
      }

      if (chunk.done) {
        break;
      }
    } catch {
      // Skip malformed lines gracefully
    }
  }

  const duration = Date.now() - startTime;
  const { visible, thinking } = partitionThinking(accumulated);

  return {
    taskId: task.id,
    role: task.role,
    success: true,
    output: visible || accumulated.trim(),
    thinking: thinking || undefined,
    duration,
  };
}

// ── Main worker entry point ────────────────────────────────────────────────

parentPort?.on('message', async (task: SubTask) => {
  // Validate incoming message
  if (!task || typeof task.id !== 'string' || typeof task.role !== 'string') {
    post({
      type: 'error',
      taskId: (task as any)?.id ?? 'unknown',
      role: (task as any)?.role ?? 'CodeAnalyzer',
      payload: { message: 'Invalid SubTask received by worker' },
      timestamp: now(),
    });
    return;
  }

  // Acknowledge receipt
  post({
    type: 'progress',
    taskId: task.id,
    role: task.role,
    payload: { status: 'accepted', role: task.role },
    timestamp: now(),
  });

  const start = Date.now();

  try {
    const result = await callOllama(task);

    post({
      type: 'result',
      taskId: task.id,
      role: task.role,
      payload: result,
      timestamp: now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    post({
      type: 'error',
      taskId: task.id,
      role: task.role,
      payload: {
        message,
        success: false,
        duration: Date.now() - start,
      },
      timestamp: now(),
    });
  }
});
