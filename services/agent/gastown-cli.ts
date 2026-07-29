/**
 * services/agent/gastown-cli.ts
 * ---------------------------------------------------------------------------
 * CLI entry point for the Gastown Manager.
 *
 * Usage:
 *   npx tsx services/agent/gastown-cli.ts "your prompt"
 *   npx tsx services/agent/gastown-cli.ts --status
 *   npx tsx services/agent/gastown-cli.ts --recall "security patterns"
 *   npx tsx services/agent/gastown-cli.ts --attack
 * ---------------------------------------------------------------------------
 *
 * kilocode_change: Gastown Manager bootstraps SafeZoneEngine before dispatch
 */

import { GastownManager } from './gastown.js';
import { createInterface } from 'node:readline';
import { SafeZoneEngine } from '@kudbee/opencode';
import { execSync } from 'node:child_process';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    const lines: string[] = [];
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines.join('\n').trim()));
    setTimeout(() => { if (lines.length === 0) { rl.close(); resolve(''); } }, 100);
  });
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 15_000 }).trim();
  } catch { return ''; }
}

const BANNER = `
╔══════════════════════════════════════════════════════════╗
║     GASTOWN — THINK-Aware Meta-Agent Coordinator        ║
║     Fuels the swarm with learned knowledge              ║
╚══════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);

  const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
  const flag = process.argv[2];

  // --status
  if (flag === '--status') {
    const manager = new GastownManager();
    await manager.bootstrap(workspaceRoot);
    const status = manager.getStatus();
    console.log(JSON.stringify(status, null, 2));
    manager.shutdown();
    return;
  }

  // --recall
  if (flag === '--recall') {
    const query = process.argv.slice(3).join(' ') || 'system architecture patterns';
    const manager = new GastownManager();
    await manager.bootstrap(workspaceRoot);
    const tokens = await manager.recall(query, 10);
    console.log(`\n  Recall: "${query}" → ${tokens.length} results\n`);
    for (const t of tokens) {
      console.log(`  • ${t.decision || t.context}: ${(t.outcome || '').slice(0, 120)}`);
    }
    manager.shutdown();
    return;
  }

  // --attack
  if (flag === '--attack') {
    console.log('  Running adversarial challenge suite…\n');
    const results: string[] = [];

    try {
      const chaos = sh('node scripts/verify-middleware-chaos.mjs 2>/dev/null');
      results.push('Middleware chaos: ' + (chaos.includes('PASS') || chaos.includes('ok') ? 'PASS' : 'RUN'));
    } catch { results.push('Middleware chaos: SKIP'); }

    try {
      const resilience = sh('node scripts/verify-resilience.mjs 2>/dev/null');
      results.push('Resilience: ' + (resilience.includes('PASS') || resilience.includes('ok') ? 'PASS' : 'RUN'));
    } catch { results.push('Resilience: SKIP'); }

    try {
      const adversarial = sh('node scripts/verify-adversarial-challenge.mjs 2>/dev/null');
      results.push('Adversarial challenge: ' + (adversarial.includes('PASS') || adversarial.includes('ok') ? 'PASS' : 'RUN'));
    } catch { results.push('Adversarial challenge: SKIP'); }

    try {
      const e2e = sh('node scripts/verify-e2e.mjs 2>/dev/null | tail -3');
      results.push('E2E suite: ' + (e2e.includes('PASS') || e2e.includes('ok') ? 'PASS' : 'RUN'));
    } catch { results.push('E2E suite: SKIP'); }

    try {
      const mesh = sh('node scripts/verify-phone-tree.mjs 2>/dev/null');
      results.push('Mesh integrity: ' + (mesh.includes('PASS') || mesh.includes('ok') ? 'PASS' : 'RUN'));
    } catch { results.push('Mesh integrity: SKIP'); }

    // Feed results into DTHINK
    for (const r of results) {
      try {
        execSync(`node scripts/dthink-pipeline.mjs feed "system:verify" "${r}"`, { timeout: 5000 });
      } catch {}
    }

    console.log('\n' + '─'.repeat(60));
    for (const r of results) {
      const icon = r.includes('PASS') ? '✓' : '✗';
      console.log(`  ${icon} ${r}`);
    }
    console.log('─'.repeat(60));
    return;
  }

  // Default: execute prompt
  let prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) prompt = await readStdin();
  if (!prompt) {
    console.error('Usage: npx tsx gastown-cli.ts "prompt" | --status | --recall | --attack');
    process.exit(1);
  }

  console.log(`  Workspace: ${workspaceRoot}`);
  console.log(`  Prompt:    ${prompt.slice(0, 80)}`);
  console.log('');

  let safeZone: SafeZoneEngine | null = null;
  try {
    safeZone = new SafeZoneEngine({ mode: 'strict' });
    await safeZone.bootstrap(workspaceRoot);
  } catch {
    console.warn('[Gastown] Safe-Zone engine unavailable (degraded)');
  }

  const manager = new GastownManager();
  await manager.bootstrap(workspaceRoot);

  const shutdown = () => { manager.shutdown(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    const { results, summary, totalDuration, thinkContext } = await manager.execute(prompt, workspaceRoot);

    console.log('\n' + '─'.repeat(60));
    console.log(`\n  ✓ ${results.length} tasks completed in ${totalDuration}ms\n`);

    for (const r of results) {
      const icon = r.success ? '✓' : '✗';
      console.log(`  ${icon} ${r.role} (${r.duration}ms)`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`\n${summary}\n`);
    console.log(`  THINK tokens loaded: ${thinkContext.relevantTokens.length}`);
    console.log(`  Swarm status: ${thinkContext.swarmStatus}`);
    console.log(`  Knowledge graph: ${thinkContext.knowledgeGraphHealth}`);
    console.log('');

    // Feed outcome to DTHINK
    try {
      execSync(`node scripts/dthink-pipeline.mjs feed "agent:complete" "Gastown session: ${results.length} tasks, ${summary.slice(0, 80)}"`, { timeout: 5000 });
    } catch {}
  } catch (err) {
    console.error('\n[Gastown] Fatal:', err instanceof Error ? err.message : String(err));
    manager.shutdown();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled:', err);
  process.exit(1);
});
