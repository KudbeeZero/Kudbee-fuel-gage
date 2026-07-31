# Frontend Browser Verification Learning

## Finding

The browser verifier used a stale release-specific Heroku hostname and attempted
to call `require()` from an ES module. That forced HTTP fallback and validated an
obsolete deployment instead of the current staging application.

## Corrections

- Default staging URL is now `https://kudbee-fuel-gage-staging.herokuapp.com`.
- `createRequire(import.meta.url)` enables real Playwright detection.
- HTML checks validate the stable `#boot-splash`, `#boot-steps`,
  `BOOT_DEADLINE_MS`, and `finishBoot` contracts.
- `STAGING_URL` remains an explicit override for Box, local, and release testing.

## Evidence

- Corrected verifier syntax: passed.
- TypeScript gate: 12/12 tasks passed.
- Current public staging probe: HTTP 404 for `/health` and root HTML.
- Playwright is not installed in this ephemeral runner, so visual browser
  evidence is not yet available.
- Upstash Box could not be started from this session because no Box command
  runner or `UPSTASH_BOX_API_KEY` is available after the environment reset.

## Promotion Rule

Do not mark `frontend-runtime-verified` as passed from release boot output alone.
Require a current canonical staging URL, public HTTP 200, Playwright DOM checks,
console-error capture, and screenshot evidence from Box or an equivalent browser
runtime.
