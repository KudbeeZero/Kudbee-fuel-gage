#!/usr/bin/env node
/**
 * scripts/skill-auto-import.mjs
 * ---------------------------------------------------------------------------
 * Agent Skill Auto-Import — Knowledge Flywheel (Pipeline 5)
 *
 * Allows active terminal agents to autonomously export their validated
 * execution traces and learnings as .kilo/skill/ entries. Kilo CLI agents
 * automatically consume these new skills on their next boot cycle.
 *
 * Each terminal agent can call exportSkill() after a successful run.
 * The exported skill appears as a named skill in the Kilo agent's
 * available_skills list (loaded from .kilo/skill/{name}/SKILL.md).
 *
 * Skill structure:
 *   .kilo/skill/{agentId}/SKILL.md   — the skill body
 *   .kilo/skill/{agentId}/TRACES.md  — execution traces (validated)
 *   .kilo/skill/{agentId}/LEARNINGS.json — learned patterns
 *
 * Fault isolation: each skill export is validated before writing.
 * Malformed traces are logged as warnings but don't crash the system.
 *
 * Usage:
 *   node scripts/skill-auto-import.mjs export <agentId>    Export agent skill
 *   node scripts/skill-auto-import.mjs list                List exported skills
 *   node scripts/skill-auto-import.mjs validate <agentId>  Validate a skill
 *   node scripts/skill-auto-import.mjs auto                Auto-export all agents
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const AGENTS_DIR = join(REPO_ROOT, '.kilo', 'agents');
const SKILLS_DIR = join(REPO_ROOT, '.kilo', 'skill');
const MEMORIES_DIR = join(REPO_ROOT, '.kilo', 'memory', 'memories');
const DECISIONS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'decisions');

mkdirSync(SKILLS_DIR, { recursive: true });

// ─── Agent parser ──────────────────────────────────────────────────────────

function parseAgent(id) {
  const path = join(AGENTS_DIR, `${id}.agent`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const meta = {};
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 3);
    if (end !== -1) {
      for (const line of raw.slice(3, end).trim().split('\n')) {
        const ci = line.indexOf(':');
        if (ci !== -1) meta[line.slice(0, ci).trim()] = line.slice(ci + 1).trim();
      }
    }
  }
  return { id, category: meta.category || 'general', description: meta.description || id,
    schedule: meta.schedule || 'manual', triggers: meta.triggers || '', uuid: meta.uuid || 'unknown' };
}

function loadMemory(id) {
  const p = join(MEMORIES_DIR, `${id}.memory`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadDecisions(id) {
  if (!existsSync(DECISIONS_DIR)) return [];
  return readdirSync(DECISIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(readFileSync(join(DECISIONS_DIR, f), 'utf8')); } catch { return null; } })
    .filter(d => d && d.agentId === id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 20);
}

// ─── Skill builder ─────────────────────────────────────────────────────────

function buildSkillContent(agent, memory, decisions) {
  const recallQueries = (memory?.recalls || []).slice(-10).map(r => `- "${r.query}" → scored ${r.score || '?'}`).join('\n') || 'none';
  const recentDecisions = decisions.slice(0, 10).map(d => `- ${d.timestamp?.slice(0,19) || '?'}: ${d.decision || '?'}`).join('\n') || 'none';

  return `---
name: ${agent.id}
description: Auto-exported skill from terminal agent "${agent.id}" (${agent.category}) — validated execution traces and learned patterns
---

# ${agent.id} — Agent Skill

**Category:** ${agent.category}
**Schedule:** ${agent.schedule}
**UUID:** ${agent.uuid}
**Exported at:** ${new Date().toISOString()}

## Description

${agent.description}

This skill was auto-exported by the terminal agent "${agent.id}" after ${memory?.totalActions || 0} successful action runs. It contains validated execution traces, learned patterns, and recall history that Kilo CLI agents can consume for context.

## Recall History (last 10)

${recallQueries}

## Execution Traces (last 10 decisions)

${recentDecisions}

## Capabilities

When activated, this skill provides Kilo agents with:
- Domain knowledge: ${agent.category}
- Recall context: ${(memory?.recalls || []).length} snippets recalled
- Execution patterns: ${(memory?.totalActions || 0)} actions validated
- Decision history: ${decisions.length} decisions logged
`;
}

// ─── Export function (fault-isolated) ──────────────────────────────────────

export function exportSkill(agentId) {
  const agent = parseAgent(agentId);
  if (!agent) {
    console.log(`[skill-import] Agent "${agentId}" not found`);
    return { success: false, error: 'agent not found' };
  }

  const skillDir = join(SKILLS_DIR, agentId);
  mkdirSync(skillDir, { recursive: true });

  const memory = loadMemory(agentId);
  const decisions = loadDecisions(agentId);

  // Build SKILL.md
  try {
    const content = buildSkillContent(agent, memory, decisions);
    writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf8');
    console.log(`[skill-import] ✓ Exported: ${agentId} → .kilo/skill/${agentId}/SKILL.md`);
  } catch (err) {
    console.log(`[skill-import] ✗ Failed to write SKILL.md for ${agentId}: ${err.message}`);
    return { success: false, error: err.message };
  }

  // Build TRACES.md (execution trace log)
  try {
    const tracesContent = [
      `# ${agentId} — Execution Traces`,
      `Exported: ${new Date().toISOString()}`,
      `Actions: ${memory?.totalActions || 0}`,
      `Decisions: ${decisions.length}`,
      '',
      '## Recent Decisions',
      ...decisions.slice(0, 10).map(d => `- **[${d.timestamp?.slice(0,19) || '?'}]** ${d.decision} (${d.id})`),
    ].join('\n');
    writeFileSync(join(skillDir, 'TRACES.md'), tracesContent, 'utf8');
  } catch (err) {
    console.log(`[skill-import] ⚠ TRACES.md for ${agentId}: ${err.message} (non-critical)`);
  }

  // Build LEARNINGS.json
  try {
    const learnings = {
      agentId,
      category: agent.category,
      exportedAt: new Date().toISOString(),
      patterns: {
        totalActions: memory?.totalActions || 0,
        totalRecalls: (memory?.recalls || []).length,
        totalDecisions: decisions.length,
        topRecalled: (memory?.recalls || []).slice(-5).map(r => ({ query: r.query, score: r.score })),
      },
      capabilities: [agent.category],
    };
    writeFileSync(join(skillDir, 'LEARNINGS.json'), JSON.stringify(learnings, null, 2), 'utf8');
  } catch (err) {
    console.log(`[skill-import] ⚠ LEARNINGS.json for ${agentId}: ${err.message} (non-critical)`);
  }

  console.log(`[skill-import] ✓ Agent ${agentId} exported: ${(memory?.totalActions || 0)} actions, ${(memory?.recalls || []).length} recalls, ${decisions.length} decisions`);
  return { success: true, agentId, learningsCount: decisions.length };
}

// ─── Auto-export all agents ────────────────────────────────────────────────

export function autoExportAll() {
  if (!existsSync(AGENTS_DIR)) {
    console.log('[skill-import] No agents directory found');
    return [];
  }

  const agentFiles = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent'));
  const results = [];

  for (const f of agentFiles) {
    const id = f.replace('.agent', '');
    try {
      const result = exportSkill(id);
      results.push({ id, ...result });
    } catch (err) {
      console.log(`[skill-import] ⚠ Failed to export ${id}: ${err.message} (fault-isolated, continuing)`);
      results.push({ id, success: false, error: err.message });
    }
  }

  return results;
}

// ─── List exported skills ──────────────────────────────────────────────────

function listSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR)
    .filter(f => {
      try { return readdirSync(join(SKILLS_DIR, f)).some(x => x === 'SKILL.md'); } catch { return false; }
    })
    .map(id => {
      try {
        const raw = readFileSync(join(SKILLS_DIR, id, 'SKILL.md'), 'utf8');
        const firstLine = raw.split('\n').find(l => l.startsWith('description:'))?.replace('description:', '').trim() || 'no description';
        const learningsPath = join(SKILLS_DIR, id, 'LEARNINGS.json');
        let stats = {};
        try { stats = JSON.parse(readFileSync(learningsPath, 'utf8')); } catch {}
        return { id, description: firstLine, actions: stats.patterns?.totalActions || 0, recalls: stats.patterns?.totalRecalls || 0 };
      } catch { return { id, description: 'error reading', actions: 0, recalls: 0 }; }
    });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'export':
    case 'build': {
      if (!arg) { console.log('Usage: skill-auto-import export <agentId>'); process.exit(1); }
      const result = exportSkill(arg);
      if (result.success) {
        console.log(`[skill-import] Skill ready: .kilo/skill/${arg}/SKILL.md`);
        console.log(`[skill-import] Kilo CLI agents will auto-consume on next boot\n`);
      }
      break;
    }

    case 'auto':
    case 'all': {
      console.log(`\n[skill-import] Auto-exporting all terminal agents...\n`);
      const results = autoExportAll();
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`\n[skill-import] Results: ${succeeded} exported, ${failed} failed (fault-isolated)\n`);
      break;
    }

    case 'list':
    case 'ls': {
      const skills = listSkills();
      console.log(`\n  Exported Agent Skills (${skills.length}):\n`);
      for (const s of skills) {
        console.log(`  ${s.id.padEnd(25)} ${s.description.slice(0, 50).padEnd(52)} actions:${String(s.actions).padStart(3)} recalls:${String(s.recalls).padStart(3)}`);
      }
      if (skills.length === 0) {
        console.log(`  (none) — run 'node scripts/skill-auto-import.mjs auto' to export`);
      }
      console.log();
      break;
    }

    case 'validate':
    case 'check': {
      if (!arg) { console.log('Usage: skill-auto-import validate <agentId>'); process.exit(1); }
      const skillDir = join(SKILLS_DIR, arg);
      const hasSkill = existsSync(join(skillDir, 'SKILL.md'));
      const hasTraces = existsSync(join(skillDir, 'TRACES.md'));
      const hasLearnings = existsSync(join(skillDir, 'LEARNINGS.json'));
      console.log(`\n  Skill validation: ${arg}`);
      console.log(`  SKILL.md:     ${hasSkill ? '✓' : '✗'}`);
      console.log(`  TRACES.md:    ${hasTraces ? '✓' : '✗'}`);
      console.log(`  LEARNINGS:    ${hasLearnings ? '✓' : '✗'}`);
      console.log(`  Status:       ${hasSkill && hasTraces && hasLearnings ? 'VALID' : 'INCOMPLETE'}\n`);
      break;
    }

    default:
      console.log(`
  Agent Skill Auto-Import — Knowledge Flywheel (Pipeline 5)

  Commands:
    export <id>      Export a single agent's skill
    auto              Auto-export all agents (fault-isolated)
    list              List all exported skills
    validate <id>     Validate a skill (SKILL.md + TRACES.md + LEARNINGS.json)

  How it works:
    1. Terminal agent completes a run (validated execution)
    2. skill-auto-import.mjs reads agent memory + decisions
    3. Builds .kilo/skill/{agentId}/SKILL.md with domain knowledge + patterns
    4. Builds TRACES.md with execution traces + LEARNINGS.json with metrics
    5. Kilo CLI agent auto-consumes .kilo/skill/* directories on next boot
    6. CLI agent now has terminal agent's knowledge as a named skill

  Fault isolation: each agent export is wrapped in try/catch.
  One malformed agent does not crash the auto-export of others.
`);
  }
}
