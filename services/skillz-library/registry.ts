/**
 * services/skillz-library/registry.ts
 * ---------------------------------------------------------------------------
 * Central registry for the SKILLZ Library.
 *
 * Each skill defines a local script path and a description so that existing
 * agents/workers can load it dynamically from Redis queue assignments.
 * ---------------------------------------------------------------------------
 */

export interface SkillDefinition {
  skill_id: string;
  script_path: string;
  description: string;
}

export const SKILLZ_REGISTRY: Record<string, SkillDefinition> = {
  'code-corrector': {
    skill_id: 'code-corrector',
    script_path: './code-corrector.js',
    description: 'Analyzes code diffs and proposes corrections for syntax errors, type mismatches, and style violations.'
  },
  'ui-tester': {
    skill_id: 'ui-tester',
    script_path: './ui-tester.js',
    description: 'Validates UI component renders against a snapshot and reports regressions in layout or accessibility.'
  },
  'telemetry-sanitizer': {
    skill_id: 'telemetry-sanitizer',
    script_path: './telemetry-sanitizer.js',
    description: 'Scrub PII and secrets from telemetry payloads before ingestion.'
  },
  'governance-auditor': {
    skill_id: 'governance-auditor',
    script_path: './governance-auditor.js',
    description: 'Reviews pending governance actions and flags high-risk decisions for human approval.'
  }
};

export function getSkill(skillId: string): SkillDefinition | undefined {
  return SKILLZ_REGISTRY[skillId];
}

export function listSkills(): SkillDefinition[] {
  return Object.values(SKILLZ_REGISTRY);
}
