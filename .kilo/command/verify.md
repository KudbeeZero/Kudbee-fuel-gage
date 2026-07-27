---
description: Run full CI verification gate (typecheck + tests + build + e2e)
---
Verify the entire project passes all CI gates:

1. `npm run typecheck` — must pass 12/12 monorepo tasks with zero errors
2. `bun test` in `services/lib/` — must pass all tests (46+)
3. `npm run build --workspace=@kudbee/web` — must build, main chunk under 500 kB
4. `node scripts/verify-e2e.mjs` — must pass 38/38 checks

Run each step sequentially. If any step fails, stop and report the failure.
If all pass, report: "All CI gates passed — ready for PR."
