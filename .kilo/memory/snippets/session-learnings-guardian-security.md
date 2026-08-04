# Session Learnings — Guardian, Security, System Pulse (2026-08-04)

> **Source:** session/agent_1e4b0149 — engineering session
> **Loop:** observe → decide → execute → verify → learn → remember

---

## 1. Merge conflict markers reached main TWICE — now prevented

- `package-lock.json` had **60 conflict markers** committed to main; broke ALL
  Heroku builds (npm ci compile fail) + local installs.
- `services/terminal/commandDispatcher.mjs` had **6 markers**; broke ingestion
  lint (`TS1185: Merge conflict marker encountered`).
- **Fix:** regenerated lockfile from clean package.json; reconstructed
  dispatcher keeping the smart-routing version.
- **Prevention (OPS-GIT-002):** `/guardian` preflight + `repository-guardian.mjs`
  blocks implementation if any tracked file has real conflict markers
  (lines matching `^\s*<<<<<<<` / `^\s*=======$` / `^\s*>>>>>>>`).
- **Gotcha:** `verify-quick.mjs` legitimately contains the string `<<<<<<<`
  in its detector — the scan must match markers ON THEIR OWN LINE, not
  substrings.

## 2. ajv hoisting broke mobile builds after lockfile regen

- Regenerating `package-lock.json` from scratch resolved **ajv 6.15.0** at root
  (no `dist/compile/codegen`), while `schema-utils@4` needs ajv ^8 → mobile
  expo/webpack build failed `Cannot find module 'ajv/dist/compile/codegen'`.
- **Fix:** add `ajv@^8.20.0`, `ajv-keywords@^5.1.0`, `schema-utils@^4.3.3` to
  ROOT devDependencies so v8 wins hoisting.
- **Lesson:** never `rm package-lock.json` blindly — install incrementally on
  the existing lockfile.

## 3. System Pulse accuracy fixes

- `/api/ci/status` was permanently `{status:"unknown"}` because nothing ever
  POSTed reports. **Fix:** GET now fetches live GitHub Actions status
  (`api.github.com/repos/KudbeeZero/Kudbee-fuel-gage/actions/runs?branch=main`)
  with 60s cache — no token needed, public repo.
- Vector status needed a backend proxy (`/api/system/vector-status`) — the
  frontend previously fetched `__VECTOR_URL__` which was never set → UNKNOWN.
- Postgres OFFLINE on cold start: the health-deep probe now **retries once
  after 1.2s** — sparse long-range pool connections warm up before reporting.

## 4. Login gate removed (single-user directive)

- `App.tsx` gated on `localStorage.getItem('kudbee_session')` → rendered
  LoginView ("MASTER PASSKEY / Provider Key Ingestion"). Backend auth was
  already disengaged; the UI contradicted it.
- **Fix:** `isAuthenticated = true` always; removed LoginView gate + both
  "Lock Session" buttons.

## 5. Express 5 + .npmrc (deploy gotchas)

- SPA catch-all MUST be `app.get('/{*path}')` — `app.get('*')` throws
  `PathError: Missing parameter name` at boot, failing BootVerify + release.
- `.npmrc` with `legacy-peer-deps=true` is REQUIRED — Heroku's plain `npm ci`
  fails on the react 19 / react-native peer conflict otherwise.

---

## Operative commands

```bash
node scripts/repository-guardian.mjs   # preflight gate (blocks if corrupt)
node scripts/self-heal.mjs heal        # recall-first fix loop (THINK tokens)
node scripts/engineering-health.mjs    # /pulse — live health metrics
node scripts/nightly-review.mjs        # ONE improvement proposal per cycle
node scripts/failure-forecaster.mjs    # predict next failing gate
```
