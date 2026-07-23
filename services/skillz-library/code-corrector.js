/**
 * services/skillz-library/code-corrector.js
 * ---------------------------------------------------------------------------
 * Boilerplate skill script — template for how existing agents execute
 * specialized tasks assigned via Redis queue.
 *
 * Workers load this dynamically based on the `skill_id` in the job payload.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_INPUT = {
  diff: '',
  language: 'typescript',
  rules: ['no-unused-vars', 'no-explicit-any', 'prefer-const']
};

function analyzeDiff(diff, language, rules) {
  const issues = [];
  const lines = String(diff || '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('+') && trimmed.includes('any')) {
      issues.push({
        line: trimmed,
        severity: 'warning',
        message: `Avoid implicit any in ${language}`,
        suggestion: trimmed.replace(/: any/, ': unknown')
      });
    }

    if (trimmed.startsWith('var ') && rules.includes('prefer-const')) {
      issues.push({
        line: trimmed,
        severity: 'info',
        message: 'Prefer const over var',
        suggestion: trimmed.replace(/^var /, 'const ')
      });
    }
  }

  return {
    skill: 'code-corrector',
    language,
    issues,
    summary: issues.length === 0 ? 'No issues detected.' : `${issues.length} issue(s) found.`
  };
}

export async function execute(input = {}) {
  const params = { ...DEFAULT_INPUT, ...input };
  const result = analyzeDiff(params.diff, params.language, params.rules);
  return {
    success: true,
    skill: 'code-corrector',
    result
  };
}

export default { execute };
