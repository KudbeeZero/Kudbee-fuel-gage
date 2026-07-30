#!/usr/bin/env node
/**
 * scripts/intelligence-planner.mjs — ISE-1 Intelligence Scheduler
 * Classifies tasks and selects models by required capability, not hard-coded provider.
 * Uses .kilo/registry/intelligence-registry.json as the single source of truth.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REGISTRY_FILE = join(ROOT, '.kilo', 'registry', 'intelligence-registry.json');

const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));

function classifyTask(prompt) {
  const lower = prompt.toLowerCase();
  if (/architecture|design pattern|component structure|dependency graph|module boundary/.test(lower))
    return 'architecture_review';
  if (/repository|codebase|full project|entire codebase|repo-wide|all files/.test(lower))
    return 'repository_analysis';
  if (/fix|bug|error|crash|undefined|exception|regression/.test(lower))
    return 'bug_fix';
  if (/refactor|clean up|simplify|extract|rename|organize/.test(lower))
    return 'refactoring';
  if (/governance|constitution|policy|gate|approval|EDR/.test(lower))
    return 'governance_review';
  if (/root cause|what caused|why did|investigation|forensic/.test(lower))
    return 'root_cause_analysis';
  if (/evidence|provenance|confidence|verify|certificate/.test(lower))
    return 'evidence_lookup';
  if (/summarize|summary|explain|describe/.test(lower))
    return 'summarization';
  if (/plan|implement|roadmap|phase|milestone/.test(lower))
    return 'planning';
  if (/document|readme|comment|docstring/.test(lower))
    return 'documentation';
  if (/research|investigate|explore|unknown|how does/.test(lower))
    return 'research';
  if (/generate|create|build|write|code|implement/.test(lower))
    return 'code_generation';
  return 'default';
}

function selectModel(taskClass, preferBudget = false) {
  const mapping = registry.task_capability_map[taskClass] || registry.task_capability_map.default;
  const primaryId = mapping.primary;
  const fallbackId = mapping.fallback;

  let selected = preferBudget && registry.models['groq-fast']
    ? registry.models['groq-fast']
    : registry.models[primaryId];
  
  if (!selected || selected.status !== 'available') {
    selected = registry.models[fallbackId];
  }
  if (!selected) selected = registry.models['dthink-deterministic'];

  return {
    task: taskClass,
    required_capabilities: mapping.required,
    selected_model: selected.model_id,
    provider: selected.provider,
    tier: selected.tier,
    est_latency_ms: selected.avg_latency_ms,
    est_cost: selected.est_cost_per_1k_chars,
    fallback: fallbackId ? registry.models[fallbackId]?.model_id || null : null,
  };
}

function planMultiPhase(prompt) {
  const taskClass = classifyTask(prompt);
  const phases = [];

  // Phase 1: Always start with deterministic DTHINK evidence lookup
  phases.push({
    phase: 1, label: 'Evidence Lookup',
    model: selectModel('evidence_lookup'),
    purpose: 'Fetch relevant DTHINK events, certificates, and graph nodes'
  });

  // Phase 2: Main task
  phases.push({
    phase: 2, label: taskClass.replace(/_/g, ' '),
    model: selectModel(taskClass),
    purpose: 'Execute primary task using optimal model for capability'
  });

  // Phase 3: Verification (use budget model for fast checks)
  phases.push({
    phase: 3, label: 'Verification',
    model: selectModel('bug_fix', true),
    purpose: 'Verify output against evidence, check for regressions'
  });

  return { task: taskClass, prompt: prompt.slice(0, 100), phases };
}

// --- CLI ---
const cmd = process.argv[2] || 'classify';
const input = process.argv.slice(3).join(' ') || process.argv[2] || '';

if (cmd === 'classify') {
  const taskClass = classifyTask(input);
  const selection = selectModel(taskClass);
  console.log(JSON.stringify({ task: taskClass, ...selection }, null, 2));
} else if (cmd === 'plan') {
  const plan = planMultiPhase(input);
  console.log(JSON.stringify(plan, null, 2));
} else if (cmd === 'registry') {
  console.log(JSON.stringify({
    models: Object.keys(registry.models).length,
    task_types: Object.keys(registry.task_capability_map).length,
    stats: Object.entries(registry.models).map(([id, m]) => ({
      id, provider: m.provider, tier: m.tier, latency: m.avg_latency_ms + 'ms'
    }))
  }, null, 2));
} else {
  // Assume input is a prompt to classify
  const taskClass = classifyTask(cmd + ' ' + process.argv.slice(3).join(' '));
  const selection = selectModel(taskClass);
  console.log(`Task: ${taskClass}`);
  console.log(`Model: ${selection.selected_model} (${selection.provider})`);
  console.log(`Tier: ${selection.tier} | Latency: ~${selection.est_latency_ms}ms`);
  console.log(`Required: [${selection.required_capabilities.join(', ')}]`);
}
