# Kudbee AGENTS.md

## Mandatory boot sequence — run BEFORE reading any other file

```bash
node scripts/handoff.mjs --stamp    # situational awareness (branch, mission, phase, recent events)
node scripts/session-bootstrap.mjs  # deep context (pipelines, agents, bus, journal, CI status)
```

State your role + first action to the human, then proceed.

## AWS STATE — READ THIS BEFORE ANY AWS WORK

**AWS_REMEDIATION_STATE.md** (`docs/AWS_REMEDIATION_STATE.md`) contains the authoritative, verified current state of all AWS resources.

**Rules:**
- READ this document first before any AWS work
- DO NOT repeat completed AWS discovery documented therein
- DO NOT spend tokens rediscovering verified state
- USE the persistent handoff as your starting point
- Live AWS state takes precedence over stale documentation

Key verified state:
- Account: 196856329692, Region: us-east-1
- Production instances: i-0a8157bc8ea33b36b, i-0685561c90845986d
- Instance Profile: EC2-SSM-MINIMAL (active)
- Minimal Role: EC2-SSM-MINIMAL with only AmazonSSMManagedInstanceCore
- Old Role: EC2-SSM-ROLE preserved with 0 policies (rollback anchor)
- SSM uses: AWS-QuickSetup-SSM-DefaultEC2MgmtRole-us-east-1 (unchanged)

## Architecture (facts not obvious from filenames)

- **Canonical server entrypoint:** `services/ingestion/server.js` — never create `server.ts` or duplicate entrypoints.
- **Monorepo workspaces:** `apps/*`, `services/*`, `packages/*` (except `!apps/mobile` — excluded, built separately).
  All `npm install` must run at root.
- **`apps/web`** — React 19 + Vite + Tailwind 4 + React Router 8 + zustand. Build entry: `index.html`. Serves from `dist/`.
- **`apps/mobile`** — React Native (Expo 52). Excluded from workspace, type-checked separately.
- **`services/lib`** — shared middleware, circuit breaker, guards, LLM clients.
- **`packages/opencode`** uses **bun** as package manager; everything else uses npm.
- **Database:** Neon Postgres + pgvector (1536-dim embeddings). Migrations auto-run on server boot.
- **Redis:** `REDIS_URL` (Fast Brain) and `REDIS_WORKER_URL` (Slow Brain, falls back to `REDIS_URL`).
  `REDIS_SLOW_URL` is a legacy alias. Circuit breaker protects against quota exhaustion (500k/month).
- **LLM provider:** `GEMINI_API_KEY` + `gemini-flash-latest`. Provider factory at `packages/utils/src/llm/providers.ts`.
  Also supports Groq (`GROQ_API_KEY`), vLLM (`VLLM_BASE_URL`/`VLLM_API_KEY`), Grok.
  **DeepSeek = ZERO APPLICATION ROUTING.** Legacy DeepSeek provider code may remain for
  reference, but the application router never selects it, no fallback chain selects it,
  and no agent should invoke it through normal application routing.
- **Test runner:** `bun test`. CI runs `bun test` after typecheck + lint.
- **Interactive terminal:** runs server-side via `POST /api/terminal/execute`, served at `/` via SPA.
- **SPA tabs:** 5 — OVERVIEW, WORKSPACE, THINKBOX, TERMINAL (OllamaChat), STUDIO (StudioRouter).

## Local development commands

```bash
npm ci                              # root only
npm run typecheck && npm run lint   # Turbo-routed
bun test                            # all unit tests
npm run build                       # Turbo build (dependsOn typecheck + lint)
```

## CI gates (enforced in order by `.github/workflows/verify.yml`)

1. `verify:typescript` — TS 7 compliance (dual compiler: `@typescript/native` TS 7 + `typescript` TS 6 alias for eslint)
2. `verify:crypto` + `verify:secrets` — runtime crypto + secret hygiene
3. `verify-config-vars` — INV-019 env var check
4. `typecheck` + `lint` — Turbo-routed strict checks
5. `bun test` — all unit tests
6. `build` — Turbo build

CI install command: `npm ci --legacy-peer-deps --ignore-scripts`.
CI env: `CI=true`, `MAX_REQUEST_BODY=256kb`, `CI_MUTATION_BUDGET=20`, `E2E_ALLOW_DATABASE_WRITES=0`.

## Deploy

### AWS / EC2 (Heroku is retired)

Deployment is AWS-native. Deploy via:

```bash
bash scripts/deploy-ec2.sh          # SSH + PM2 deploy to EC2
bash scripts/deploy-ec2-ssm.sh      # SSM-based deploy
```

| Service | Command | Notes |
|---------|---------|-------|
| web | `npx tsx services/ingestion/server.js` | port 3000 |
| hermes-worker | `npx tsx worker.js` | |
| monitor-worker | `node services/monitor/agent.js` | |
| sentinel | `npx tsx services/sentinel/src/index.ts` | |
| release | `node scripts/boot-verify.mjs` | self-verify before traffic |

### Render

`render.yaml` Blueprint. Web service needs `plan: starter` (512MB) — free plan OOMs.
Build command must include `--include=dev` because `tsx` is a devDependency and Render sets `NODE_ENV=production`.

## Critical gotchas

- **Express 5 SPA catch-all:** must use `app.get('/{*path}')`. `app.get('*')` throws `PathError: Missing parameter name`.
- **groqClient.ts import:** must import `./budgetGate.ts` (`.ts` extension required).
- **express hoisting:** `services/telemetry/degradation-monitor.ts` imports express — express must be a ROOT dependency or the server fails to boot.
- **`.npmrc`** (`legacy-peer-deps=true`) is mandatory. CI `npm ci` fails without it (React 19 / react-native peer conflict).
- **`.env` loading in scripts:** standalone `.mjs` scripts need `try { process.loadEnvFile('.env'); } catch {}` at the top.
- **Secret scanner semantics:** placeholders (`${VAR}`, `process.env.X`, `env.X`) are templates, NOT secrets. When a scanner false-positives on a template, fix the scanner invariant — never contort generated code.
- **`think_tokens` ≠ `vector_memory`:** minting a think token does NOT auto-sync — call `storeMemoryText()` explicitly.
- **TS 7 dual setup:** `npx tsc` resolves `@typescript/native` (actual TS 7 compiler). `typescript` at root is a TS 6 alias for typescript-eslint only. Never introduce TS 5.x or lower.
- **Dependency cascade:** merging multiple lockfile-touching PRs corrupts `package-lock.json`. Regenerate incrementally (install on top of existing lockfile, never `rm package-lock.json`).

## Code style

- **Prettier:** `semi`, `singleQuote`, `trailingComma: es5`, `printWidth: 100`, `LF`.
- **Imports:** server.js and lib files use `node:` prefix for builtins.
- **`// kilocode_change` markers** are required in `apps/web/src/hooks/useToolInterceptor.ts` and `services/agent/cli.ts`.

## Repository protection

- **Run the guardian before implementing:** `node scripts/repository-guardian.mjs`. If any check fails — STOP, report, do not implement.
- **Dirty tree = blocked.** Resolve before starting any work.
- **Never edit main directly.** mission → branch → push → PR → merge.
- **INV-013 Keystone:** this file, `kilo.json`, governance files, and CI workflows may never be modified by an executing cloud agent. Changes require human-approved PRs.
- **Terminal auth:** `POST /api/terminal/execute` is gated by `AGENT_REGISTRY_PATH`: unset = open access (Mode A), set = `X-Agent-Pass` required (Mode B).
- **One terminal owner:** `apps/web/terminal.html`. Never duplicate.

## Self-healing

```bash
node scripts/self-heal.mjs check      # run gates
node scripts/self-heal.mjs diagnose   # + Gemini diagnosis on failure
node scripts/self-heal.mjs heal       # recall-first loop, mints THINK token
```

Failures are signature-matched against `.kilo/memory/heal-patterns.json` BEFORE calling Gemini (known patterns = zero LLM cost). .github/workflows/autonomous-maintenance.yml runs every 6 hours.
