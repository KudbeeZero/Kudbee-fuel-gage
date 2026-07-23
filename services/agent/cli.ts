/**
 * services/agent/cli.ts
 * ---------------------------------------------------------------------------
 * CLI entry point for the Group 7 Multi-Agent Orchestrator.
 *
 * Usage:
 *   npx tsx services/agent/cli.ts "your prompt here"
 *   echo "your prompt" | npx tsx services/agent/cli.ts
 *   WORKSPACE_ROOT=/path/to/project npx tsx services/agent/cli.ts "analyze security"
 */

import { SupervisorOrchestrator } from './orchestrator';
import { createInterface } from 'node:readline';

// ── Helpers ────────────────────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    const lines: string[] = [];

    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\n').trim()));
    rl.on('error', reject);

    // If stdin is a TTY and no data arrives quickly, resolve empty
    setTimeout(() => {
      if (lines.length === 0) {
        rl.close();
        resolve('');
      }
    }, 100);
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(2)}m`;
}

function renderProgressBar(label: string, current: number, total: number, width = 30): string {
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `  ${label.padEnd(20)} [${bar}] ${current}/${total}`;
}

// ── Banner ─────────────────────────────────────────────────────────────────

const BANNER = `
╔══════════════════════════════════════════════════════════╗
║     KUDBEE Group 7 — Multi-Agent Orchestrator           ║
║     Supervisor + DAG + Isolated Worker Pool             ║
╚══════════════════════════════════════════════════════════╝
`;

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(BANNER);

  // Resolve prompt from argv or stdin
  let prompt = process.argv.slice(2).join(' ').trim();

  if (!prompt) {
    prompt = await readStdin();
  }

  if (!prompt) {
    console.error('Error: No prompt provided. Usage: npx tsx cli.ts "your prompt"');
    process.exit(1);
  }

  const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();

  console.log(`  Workspace : ${workspaceRoot}`);
  console.log(`  Prompt    : ${prompt}`);
  console.log('');

  const orchestrator = new SupervisorOrchestrator();

  // Register signal handlers for graceful shutdown
  const shutdown = () => {
    console.log('\n[CLI] Shutting down orchestrator...');
    orchestrator.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    const { results, summary, totalDuration } = await orchestrator.execute(prompt, workspaceRoot);

    // ── Results rendering ──────────────────────────────────────────────

    console.log('\n' + '─'.repeat(60));
    console.log(`\n  ✓ ${results.length} tasks completed in ${formatDuration(totalDuration)}\n`);

    // Per-role result summary
    const roleIcons: Record<string, string> = {
      CodeAnalyzer: '🔍',
      SecurityScanner: '🔐',
      TestRunner: '🧪',
      DependencyChecker: '📦',
      DocumentationGenerator: '📝',
      TypescriptValidator: '📘',
    };

    for (const r of results) {
      const icon = roleIcons[r.role] ?? '●';
      const status = r.success ? '✓' : '✗';
      const dur = r.duration > 0 ? ` (${formatDuration(r.duration)})` : '';
      console.log(`  ${icon} ${status} ${r.role}${dur}`);
    }

    // Print synthesis
    console.log('\n' + '─'.repeat(60));
    console.log(`\n${summary}\n`);

    // Print thinking traces if any
    const thoughts = results.filter((r) => r.thinking);
    if (thoughts.length > 0) {
      console.log('─'.repeat(60));
      console.log(`\n  💭 Thinking traces captured: ${thoughts.length} agent(s)\n`);
      for (const t of thoughts) {
        console.log(`  ┌─ ${t.role} ─────────────────────────────`);
        console.log(`  │ ${(t.thinking ?? '').slice(0, 200).replace(/\n/g, '\n  │ ')}`);
        if ((t.thinking ?? '').length > 200) console.log('  │ ... (truncated)');
        console.log('  └' + '─'.repeat(40));
      }
      console.log('');
    }
  } catch (err: unknown) {
    console.error('\n[CLI] Fatal error:', err instanceof Error ? err.message : String(err));
    orchestrator.shutdown();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
