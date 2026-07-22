// services/agents/src/context-factory.ts
// ---------------------------------------------------------------------------
// Phase 6 — Agent Context Factory & Dynamic Skills Tagging.
//
// Instead of feeding the agent one massive, static system prompt, we assemble
// the LLM system prompt dynamically per task, injecting ONLY the relevant
// Immutable Laws and API/schema fragments referenced by the active SkillTags.
// This keeps the context window lean and prevents context bloat + hallucination
// during long reasoning chains.
//
// The factory enforces a strict, non-negotiable hierarchy:
//   1. <BASE_IDENTITY>        — who the agent is.
//   2. <IMMUTABLE_LAWS>       — NEVER omitted, even when no skill is active.
//   3. <DYNAMIC_SKILLS>       — the context injected by the active skills.
//   4. <GOVERNANCE_GATE>      — auto-injected when any active skill mutates or
//                               destroys state (Phase 5 chain-of-thought gate).
//
// Zero runtime dependencies: only the shared @kudbee packages are imported, so
// this module is deterministic and safe to run in any environment (Resilient-
// First — it never throws on malformed skill tags; it validates and degrades).
// ---------------------------------------------------------------------------

import {
  IMMUTABLE_LAWS,
  type ImmutableLawId,
  type SkillTag
} from '@kudbee/types';
import { GOVERNANCE_GATE_COT_PROMPT } from '@kudbee/utils/prompts/agent-core';

/** The canonical base identity. Always present at the top of the prompt. */
export const BASE_IDENTITY = `<BASE_IDENTITY>
You are the Primary Agent for the Kudbee Agentic Rack System. You are a
deterministic, strictly-constrained code-generation and reasoning engine. Your
output becomes production infrastructure, so precision beats verbosity.
</BASE_IDENTITY>`;

/** Delimiters used to wrap each hierarchy section. */
const SECTION = {
  laws: 'IMMUTABLE_LAWS',
  skills: 'DYNAMIC_SKILLS',
  gate: 'GOVERNANCE_GATE'
} as const;

/**
 * Render the IMMUTABLE_LAWS section. When `lawIds` is empty we still emit the
 * FULL law set — these laws are ABSOLUTE and must NEVER be omitted. When skills
 * are active we additionally surface only the laws those skills reference, but
 * the complete catalog is always rendered so the agent can never drift.
 */
function renderImmutableLaws(lawIds: ImmutableLawId[]): string {
  const referenced = new Set<ImmutableLawId>(lawIds);
  const lines: string[] = IMMUTABLE_LAWS.map((law, index) => {
    const marker = referenced.has(law.id) ? ' [ACTIVE]' : '';
    return `${index + 1}. ${law.id}${marker}: ${law.summary}`;
  });
  return `<${SECTION.laws}>
These laws are ABSOLUTE and UNBREAKABLE during every reasoning step. Violating
any one of them is a hard failure, regardless of how "convenient" a deviation
might seem. They are NEVER omitted from the context window.

${lines.join('\n')}
</${SECTION.laws}>`;
}

/** Render the DYNAMIC_SKILLS section from the active, validated skill tags. */
function renderDynamicSkills(skills: SkillTag[]): string {
  if (skills.length === 0) {
    return `<${SECTION.skills}>
No dynamic skills are active for this request. Reason from the Immutable Laws
and the base identity only. Do not invent capabilities, schemas, or APIs that
have not been injected here.
</${SECTION.skills}>`;
  }

  const blocks = skills.map((skill) => {
    const lawRefs =
      skill.requiredLaws.length > 0
        ? ` (references laws: ${skill.requiredLaws.join(', ')})`
        : '';
    return `### SKILL: ${skill.id}${lawRefs}
${skill.description}

${skill.injectedContext}`;
  });

  return `<${SECTION.skills}>
The following skill context fragments are injected for this request. Each is a
contract — treat its schema/API as authoritative and do not contradict it.

${blocks.join('\n\n')}
</${SECTION.skills}>`;
}

/**
 * Render the GOVERNANCE_GATE section. This is automatically injected whenever
 * any active skill is `destructive` (mutation/destruction). It appends the
 * Phase 5 GOVERNANCE_GATE_COT_PROMPT so the agent computes its 0-6 risk score
 * before acting.
 */
function renderGovernanceGate(destructiveSkills: SkillTag[]): string {
  const triggers = destructiveSkills.map((s) => s.id).join(', ');
  return `<${SECTION.gate}>
A destructive/mutating skill is active (${triggers}). You MUST run the
Governance Gate chain-of-thought calculus BEFORE executing any action. The gate
is authoritative: if Total_Risk >= 2 you are FORBIDDEN from acting and must
halt for human-in-the-loop approval.

${GOVERNANCE_GATE_COT_PROMPT}
</${SECTION.gate}>`;
}

/**
 * Build the assembled LLM system prompt for a request from its active skills.
 *
 * Enforces the strict hierarchy:
 *   1. BASE_IDENTITY
 *   2. IMMUTABLE_LAWS      (never omitted)
 *   3. DYNAMIC_SKILLS
 *   4. GOVERNANCE_GATE     (only when a destructive skill is active)
 *
 * `requestText` is accepted for API symmetry (and future vector recall hooks)
 * but the strict assembly order is driven by `activeSkills`.
 */
export function buildAgentContext(requestText: string, activeSkills: SkillTag[]): string {
  // Resilient-First: tolerate non-array / malformed input instead of throwing.
  const skills: SkillTag[] = Array.isArray(activeSkills) ? activeSkills : [];

  // Aggregate the law ids referenced by every active skill (for [ACTIVE] marks).
  const referencedLaws: ImmutableLawId[] = skills.flatMap((s) => s.requiredLaws);

  // Destructure the hierarchy into ordered sections.
  const sections: string[] = [
    BASE_IDENTITY,
    renderImmutableLaws(referencedLaws),
    renderDynamicSkills(skills)
  ];

  // Auto-inject the Governance Gate if any active skill mutates/destroys state.
  const destructive = skills.filter((s) => s.destructive);
  if (destructive.length > 0) {
    sections.push(renderGovernanceGate(destructive));
  }

  // `requestText` is intentionally NOT concatenated here — it belongs to the
  // user turn, not the static system prompt. Kept in the signature so callers
  // can pass task context through to future vector-memory recall hooks.
  void requestText;

  return sections.join('\n\n');
}

/**
 * Phase 28 — The Token Forge injection point.
 *
 * Appends a pre-rendered "Past Successful Execution Context" section (produced
 * by `renderThinkTokenContext` in the memory layer) to an already-assembled
 * agent system prompt. This is the few-shot RAG loop: retrieved Think Tokens
 * are injected into the active agent's system prompt BEFORE it routes to the
 * LLM, grounding its reasoning in verified prior successes.
 *
 * Pure + synchronous + decoupled: this helper takes the rendered section as a
 * string so the context factory never imports the memory package directly (the
 * async pgvector recall is performed by the caller — the server middleware —
 * which already depends on both layers). An empty/blank `forgeSection` is a
 * no-op so the base hierarchy is returned unchanged (graceful fallback).
 */
export function appendForgeContext(baseContext: string, forgeSection: string): string {
  const base = typeof baseContext === 'string' && baseContext.length > 0 ? baseContext : '';
  const forge = typeof forgeSection === 'string' ? forgeSection.trim() : '';
  if (forge.length === 0) return base;
  return `${base}\n\n${forge}`;
}

/**
 * Lightweight, dependency-free keyword heuristic that maps a free-text user
 * request to the set of SkillTags it likely needs. This is the pre-vector-DB
 * routing layer: once the Vector Memory pipeline (Phase 4/5) is fully wired,
 * this function is replaced by semantic recall against system_topology.
 *
 * The catalog below is the canonical skill registry. Each entry pairs a tag
 * with the regex used to detect its intent. `destructive` flags those that
 * must trigger the Governance Gate.
 */
interface SkillRule {
  tag: SkillTag;
  pattern: RegExp;
}

const SKILL_RULES: SkillRule[] = [
  {
    tag: {
      id: 'DATABASE_MUTATION',
      description:
        'Write/alter persistent state in Neon Postgres. Mutates the system of record and must pass the Governance Gate risk calculus.',
      requiredLaws: ['STRICT_TYPECHECK', 'BLUEPRINT_FIRST'],
      injectedContext:
        'API: PostgreSQL via shared pg.Pool (services/lib/db.js -> getDbPool()).\n' +
        'Contract: every mutation MUST be parameterized ($1,$2,...), wrapped in try/catch, and logged. Never emit raw string-interpolated SQL.',
      destructive: true
    },
    pattern: /\b(insert|update|delete|upsert|drop|alter|create table|mutate|write to (the )?db|persist|migrat)/i
  },
  {
    tag: {
      id: 'REACT_UI_COMPONENT',
      description:
        'Author React/Vite dashboard components for the Control Tower. Constrained by Node 22 ESM + zero any.',
      requiredLaws: ['NODE22_ESM_EXT', 'ZERO_ANY', 'EXPLICIT_ESM_EXTENSION', 'STRICT_TYPECHECK'],
      injectedContext:
        'Stack: React 18 + Vite, strict TS, no any. Components live in apps/web/src/components.\n' +
        'Contract: all props are concrete interfaces; import shared types from @kudbee/types; emit .tsx only.',
      destructive: false
    },
    pattern: /\b(react|component|tsx|jsx|dashboard ui|frontend|button|widget|render)/i
  },
  {
    tag: {
      id: 'EDGE_TELEMETRY',
      description:
        'Parse high-velocity Edge Sentinel telemetry and evaluate blast radius. Read-only signal analysis.',
      requiredLaws: ['ZERO_ANY', 'STRICT_TYPECHECK'],
      injectedContext:
        'Source: kudbee:telemetry_feed (Redis). Contract: suppress 2xx/health pings; extract only critical\n' +
        'anomalies (latency > 1000ms, 5xx, OOM) verbatim inside <CRITICAL_SIGNAL> tags.',
      destructive: false
    },
    pattern: /\b(telemetry|latency|sentinel|anomaly|metric|log|trace|throughput|alert)/i
  },
  {
    tag: {
      id: 'VECTOR_MEMORY_RECALL',
      description:
        'Semantic recall against the Self-Aware Vector Memory layer for blueprint-first reasoning.',
      requiredLaws: ['BLUEPRINT_FIRST', 'STRICT_TYPECHECK'],
      injectedContext:
        'API: querySystemTopology(embedding, limit) via @kudbee/memory. Table: system_topology_embeddings.\n' +
        'Contract: before any infra/schema/route change, recall the verified topology first.',
      destructive: false
    },
    pattern: /\b(topology|blueprint|vector|recall|semantic|memory|architecture|schema of the rack)/i
  },
  {
    tag: {
      id: 'GOVERNANCE_HITL',
      description:
        'Surface proposed agent actions for Human-in-the-Loop approval via the Governance Gate.',
      requiredLaws: ['STRICT_TYPECHECK', 'ZERO_ANY'],
      injectedContext:
        'API: POST /api/governance/resolve { id, decision }. Type ApprovalRequest from @kudbee/types.\n' +
        'Contract: Total_Risk >= 2 MUST halt and emit the PENDING_APPROVAL JSON payload.',
      destructive: true
    },
    pattern: /\b(approve|reject|governance|hitl|human.?in.?the.?loop|pending approval|gate)/i
  }
];

/**
 * Determine which SkillTags are required for a given user request using simple
 * regex/keyword heuristics. Returns the concrete SkillTag objects (with their
 * injected context) so callers can feed them straight into buildAgentContext.
 *
 * Resilient-First: an empty or non-string request yields an empty list rather
 * than throwing.
 */
export function evaluateRequiredSkills(requestText: string): SkillTag[] {
  if (typeof requestText !== 'string' || requestText.length === 0) {
    return [];
  }

  const matched: SkillTag[] = [];
  for (const rule of SKILL_RULES) {
    if (rule.pattern.test(requestText)) {
      // Clone so callers cannot mutate the shared catalog rule.
      matched.push({
        id: rule.tag.id,
        description: rule.tag.description,
        requiredLaws: [...rule.tag.requiredLaws],
        injectedContext: rule.tag.injectedContext,
        destructive: rule.tag.destructive
      });
    }
  }
  return matched;
}
