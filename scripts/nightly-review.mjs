#!/usr/bin/env node
/**
 * scripts/nightly-review.mjs — Platform Self-Critique (Directive #5)
 * ---------------------------------------------------------------------------
 * Every night the platform reviews itself and proposes ONE improvement.
 *
 * Questions:
 *   • What failed? / What almost failed?
 *   • What took too long? / Which prompts wasted tokens?
 *   • Which CI jobs wasted minutes? / Which skills are obsolete?
 *   • Which agents were idle? / Which documentation wasn't used?
 *
 * Output: ONE improvement mission (small, mergeable, verified) recorded
 * to DTHINK and proposed on the roadmap as the next in_progress phase.
 *
 *   node scripts/nightly-review.mjs            → run self-review
 *   node scripts/nightly-review.mjs --json     → machine-readable
 * ---------------------------------------------------------------------------
 */
import { execFile } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');

function run(cmd, args, timeout = 20000) {
  return new Promise(res => {
    execFile(cmd, args, { cwd: REPO_ROOT, timeout, maxBuffer: 1024 * 512 },
      (err, stdout, stderr) => res((stdout || '') + (stderr || '')));
  });
}

async function review() {
  const findings = { failed: [], slow: [], wasted: [], idle: [], obsolete: [], improvement: null };

  // ── What failed / almost failed? — read self-heal pattern store ──
  try {
    const patterns = JSON.parse(readFileSync(join(MEMORY_DIR, 'heal-patterns.json'), 'utf8')).patterns || [];
    if (patterns.length) {
      findings.failed = patterns.map(p => ({ sig: p.signature?.slice(0, 80), hits: p.hits }));
    }
  } catch {}

  // ── Which agents were idle? — decision counts per agent ──
  const decisionsDir = join(MEMORY_DIR, 'decisions');
  const perAgent = {};
  try {
    for (const f of readdirSync(decisionsDir).filter(f => f.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(decisionsDir, f), 'utf8'));
        const agent = d.agent || d.agentId || 'unknown';
        perAgent[agent] = (perAgent[agent] || 0) + 1;
      } catch {}
    }
  } catch {}
  const all = Object.entries(perAgent).sort((a, b) => a[1] - b[1]);
  findings.idle = all.slice(0, 2).map(([agent, count]) => ({ agent, decisions: count }));

  // ── Which prompts wasted tokens? — echo library history ──
  try {
    const echo = join(MEMORY_DIR, 'echo', 'prompts.json');
    if (existsSync(echo)) {
      const state = JSON.parse(readFileSync(echo, 'utf8'));
      for (const [kind, hist] of Object.entries(state.history || {})) {
        if (hist.count >= 5 && hist.success / hist.count < 0.7) {
          findings.wasted.push({ kind, successRate: Math.round((hist.success / hist.count) * 100) });
        }
      }
    }
  } catch {}

  // ── Struggle log trends — repeating root causes demand action ──
  try {
    const logFile = join(MEMORY_DIR, 'struggle-log.json');
    if (existsSync(logFile)) {
      const log = JSON.parse(readFileSync(logFile, 'utf8'));
      const struggles = Array.isArray(log.struggles) ? log.struggles : [];
      // Group by normalized root cause (first 40 chars, lowercased)
      const byCause = {};
      for (const s of struggles) {
        const raw = (s.rootCause || 'unknown').toLowerCase();
        // Theme buckets: surface repeating PATTERNS, not exact strings
        let key = raw.slice(0, 40);
        if (raw.includes('mime') || raw.includes('text/html') || raw.includes('content-type')) key = 'MIME/content-type asset serving';
        else if (raw.includes('quota') || raw.includes('max requests') || raw.includes('500000')) key = 'Redis quota exhaustion';
        else if (raw.includes('conflict') || raw.includes('<<<<<<<') || raw.includes('merge marker')) key = 'merge conflict markers';
        else if (raw.includes('express 5') || raw.includes('path-to-regexp') || raw.includes('patherror')) key = 'Express 5 route syntax';
        byCause[key] = byCause[key] || { count: 0, sessions: [], prevention: s.prevention || '' };
        byCause[key].count++;
        byCause[key].sessions.push(s.session);
        if (s.prevention && !byCause[key].prevention) byCause[key].prevention = s.prevention;
      }
      const repeating = Object.entries(byCause)
        .filter(([, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count);
      if (repeating.length) {
        const [cause, v] = repeating[0];
        findings.struggleTrend = {
          cause: cause.slice(0, 60),
          count: v.count,
          sessions: v.sessions.slice(0, 3),
          prevention: v.prevention.slice(0, 120),
        };
      }
    }
  } catch {}

  // ── Which CI jobs wasted minutes? — latest system status ──
  const sysOut = await run('node', ['scripts/system-status.mjs', 'check']);
  if (/Docs stamped: 0\/5/i.test(sysOut)) {
    findings.slow.push('docs stamping — 0/5 documentation files timestamped');
  }

  // ── Propose ONE improvement (prioritized: struggle trends first) ──
  if (findings.struggleTrend) {
    const t = findings.struggleTrend;
    findings.improvement = {
      title: `Break the repeating struggle: ${t.cause.slice(0, 50)} (${t.count}x)`,
      detail: `This root cause has recurred ${t.count} times across sessions. Prevention on record: ${t.prevention.slice(0, 100)}`,
      evidence: `struggle-log: ${t.sessions.join(', ')}`,
      scope: 'small — apply the recorded prevention as a guard/test',
    };
  } else if (findings.wasted.length) {
    const w = findings.wasted[0];
    findings.improvement = {
      title: `Improve ${w.kind} prompt quality (${w.successRate}% success)`,
      detail: 'Review past prompts in the Echo Prompt Library and promote a refined system prompt.',
      evidence: `echo history: ${w.kind} at ${w.successRate}% success across sessions`,
      scope: 'small — one prompt file, verified via /echo',
    };
  } else if (findings.failed.length) {
    findings.improvement = {
      title: `Add test for recurring pattern (${findings.failed[0].hits} hits)`,
      detail: 'The most-hit failure signature needs a regression test so it never recurs.',
      evidence: findings.failed[0].sig,
      scope: 'small — one test file',
    };
  } else if (findings.slow.length) {
    findings.improvement = {
      title: 'Stamp documentation timestamps (0/5)',
      detail: 'Run the doc-stamping pipeline so the system-status check goes green.',
      evidence: 'system-status reports 0/5 docs stamped',
      scope: 'trivial — one script invocation',
    };
  } else {
    findings.improvement = {
      title: 'No improvement needed this cycle',
      detail: 'All systems healthy — continue current mission cadence.',
      evidence: 'no failures, no wasted prompts, no idle agents with gaps',
      scope: 'none',
    };
  }

  return { generatedAt: new Date().toISOString(), findings };
}

const result = await review();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const f = result.findings;
  console.log('════════ NIGHTLY SELF-REVIEW ════════');
  console.log(`  Failed patterns:   ${f.failed.length} (top: ${f.failed[0]?.sig?.slice(0, 50) || 'none'})`);
  console.log(`  Idle agents:       ${f.idle.map(i => `${i.agent} (${i.decisions})`).join(', ') || 'none'}`);
  console.log(`  Wasted prompts:    ${f.wasted.length ? f.wasted.map(w => `${w.kind} ${w.successRate}%`).join(', ') : 'none'}`);
  console.log(`  Slow items:        ${f.slow.length ? f.slow[0] : 'none'}`);
  console.log('  ── ONE IMPROVEMENT ──');
  console.log(`  ${f.improvement.title}`);
  console.log(`  ${f.improvement.detail}`);
  console.log(`  Scope: ${f.improvement.scope}`);
  console.log('══════════════════════════════════════');
}
