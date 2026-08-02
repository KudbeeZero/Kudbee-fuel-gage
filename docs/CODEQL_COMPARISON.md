# CODEQL_COMPARISON.md

## Why Two CodeQL Executions Exist

1. **Custom CodeQL** (`.github/workflows/codeql.yml`):
   - Explicit repository file.
   - Uses `github/codeql-action/init@v4` with custom config `.github/codeql-config.yml`.
   - Language: `javascript-typescript`.
   - 122 runs, all success, median 101s.

2. **GitHub Default Setup CodeQL** (dynamic `github-code-scanning/codeql`):
   - Managed by GitHub Advanced Security default setup.
   - No custom config.
   - Triggers: PR and push to main.

## Do They Analyze the Same Commit?

Yes. Both trigger on identical events.

## Does Coverage Differ?

Unknown without inspecting `.github/codeql-config.yml` vs. default query packs.

## Single Authority Recommendation

**Custom CodeQL** should become the single authority. It is version-controlled, explicit, and reviewable. Disable GitHub default setup once equivalence is confirmed.

## Action Required

Disable GitHub default setup CodeQL. Do not delete either until verified.
