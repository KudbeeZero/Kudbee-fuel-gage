#!/usr/bin/env node
/**
 * scripts/handoff.mjs — Instant Situational Awareness for Any Agent
 * ---------------------------------------------------------------------------
 * THE HANDOFF MANIFEST: one command that lets ANY cloud agent, on ANY branch,
 * doing ANYTHING, instantly know:
 *
 *   • WHO they are (role, session)
 *   • WHERE they are (branch, HEAD, working tree)
 *   • WHAT the mission is (roadmap phase + mission statement)
 *   • HOW the system is doing (health, CI, fleet)
 *   • WHAT happened recently (DTHINK tail, decisions)
 *   • WHAT to do next (next phase, next action)
 *
 *   node scripts/handoff.mjs            → full briefing (human-readable)
 *   node scripts/handoff.mjs --json     → machine-readable manifest
 *   node scripts/handoff.mjs --stamp    → write .kilo/handoff.json + print
 *
 * Every agent should run this FIRST on session start. The manifest is
 * also stamped to .kilo/handoff.json so any process can read it without
 * running commands.
 * ---------------------------------------------------------------------------
 */
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HANDOFF_FILE = join(REPO_ROOT, '.kilo', 'handoff.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, args) {
  return new Promise(res => {
    execFile(cmd, args, { cwd: REPO_ROOT, timeout: 15000, maxBuffer: 1024 * 256 },
      (err, stdout) => res(err ? '' : String(stdout).trim()));
  });
}

async function gitInfo() {
  const [branch, sha, status] = await Promise.all([
    run('git', ['branch', '--show-current']),
    run('git', ['rev-parse', '--short', 'HEAD']),
    run('git', ['status', '--porcelain']),
  ]);
  const dirtyCount = status ? status.split('\n').filter(Boolean).length : 0;
  return { branch: branch || 'detached', sha: sha || 'unknown', dirtyCount };
}

function loadRoadmap() {
  return null;
}

async function roadmapStatus() {
  try {
    const mod = await import('../services/terminal/roadmap.mjs');
    const r = mod.getRoadmapStatus();
    const next = r.phases.find(p => p.status === 'planned' || p.status === 'in_progress');
    return {
      total: r.total,
      percentComplete: r.percentComplete,
      current: r.phases.find(p => p.status === 'in_progress') || r.phases.find(p => p.status === 'verified') || null,
      nextUp: next ? { id: next.id, name: next.name, status: next.status } : null,
      mission: r.missionStatement || '',
    };
  } catch { return null; }
}

async function dthinkTail() {
  try {
    const out = await new Promise(res => execFile('node', ['scripts/dthink-pipeline.mjs', 'tail', '5'],
      { cwd: REPO_ROOT, timeout: 15000 }, (e, so) => res(e ? '' : so)));
    const lines = out.split('\n').filter(l => l.includes('✓') || l.includes('▸') || l.includes('→')).slice(-5);
    return lines.map(l => l.trim().replace(/^\s*[✓▸→]\s*/, '')).slice(0, 5);
  } catch { return []; }
}

async function fleetStatus() {
  try {
    const out = await new Promise(res => execFile('node', ['scripts/agents.mjs', 'status'],
      { cwd: REPO_ROOT, timeout: 15000 }, (e, so) => res(e ? '' : so)));
    const m = out.match(/agents:\s+(\d+)/i);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

// ── Manifest ─────────────────────────────────────────────────────────────────

export async function buildManifest() {
  const git = await gitInfo();
  const roadmap = await roadmapStatus();
  const events = await dthinkTail();
  const fleet = await fleetStatus();

  return {
    generatedAt: new Date().toISOString(),
    identity: {
      agent: process.env.AGENT_ID || process.env.KUDBEE_AGENT || 'cloud-agent',
      role: roadmap?.current?.name || 'awaiting mission assignment',
      session: process.env.KILO_SESSION || null,
    },
    location: git,
    mission: {
      mission: roadmap?.mission || 'Kudbee — self-improving Engineering OS',
      phase: roadmap?.current ? `${roadmap.current.id} — ${roadmap.current.name}` : 'between phases',
      percentComplete: roadmap?.percentComplete ?? null,
      nextUp: roadmap?.nextUp || null,
    },
    system: {
      fleet: fleet ?? null,
      lastEvents: events,
      links: {
        staging: 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com',
        production: 'https://kudbee-fuel-gage-330ade653a62.herokuapp.com',
        terminal: 'https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/terminal.html',
        github: 'https://github.com/KudbeeZero/Kudbee-fuel-gage',
      },
    },
    firstAction:
      roadmap?.nextUp
        ? `Proceed with ${roadmap.nextUp.id} — ${roadmap.nextUp.name}. One objective, one branch, one PR.`
        : 'All roadmap phases complete or in progress — verify system health, then await next mission.',
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const flag = process.argv[2] || '';

const manifest = await buildManifest();

if (flag === '--json') {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  console.log('══════════════════════════════════════════════');
  console.log('  KUDBEE — HANDOFF BRIEFING');
  console.log('  Agent:   ' + manifest.identity.agent);
  console.log('  Role:    ' + manifest.identity.role);
  console.log('══════════════════════════════════════════════');
  console.log('  Branch:  ' + manifest.location.branch + ' (' + manifest.location.sha + ')');
  console.log('  Dirty:   ' + manifest.location.dirtyCount + ' file(s)');
  console.log('  Mission: ' + manifest.mission.mission.slice(0, 70));
  console.log('  Phase:   ' + manifest.mission.phase);
  console.log('  Progress:' + (manifest.mission.percentComplete ?? '?') + '%');
  if (manifest.mission.nextUp) {
    console.log('  Next:    ' + manifest.mission.nextUp.id + ' — ' + manifest.mission.nextUp.name);
  }
  console.log('  Fleet:   ' + (manifest.system.fleet ?? '?') + ' agents');
  if (manifest.system.lastEvents.length) {
    console.log('  Recent:');
    manifest.system.lastEvents.forEach(e => console.log('    • ' + e.slice(0, 90)));
  }
  console.log('  ── ACTION ──');
  console.log('  ' + manifest.firstAction);
  console.log('  ── LINKS ──');
  console.log('  Staging:  ' + manifest.system.links.staging);
  console.log('  Terminal: ' + manifest.system.links.terminal);
  console.log('══════════════════════════════════════════════');
}

if (flag === '--stamp' || process.env.HANDOFF_STAMP === '1') {
  if (!existsSync(join(REPO_ROOT, '.kilo'))) mkdirSync(join(REPO_ROOT, '.kilo'), { recursive: true });
  writeFileSync(HANDOFF_FILE, JSON.stringify(manifest, null, 2));
  console.log('[handoff] manifest stamped → .kilo/handoff.json');
}
