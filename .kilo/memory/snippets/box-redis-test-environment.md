# Upstash Box + Redis Test Environment — Implementation Guide

> **Status:** VERIFIED — 2026-08-02T16:40:00Z
> **Verifier:** session/agent_1e4b0149-e4bd-48d0-8b36-d143adea47d0 (KILOH)
> **Persistent Box ID:** `coherent-beagle-67807`
> **CI Workflow:** `.github/workflows/box-test.yml` (PR #280)

---

## 1. What this is

Kudbee uses **Upstash Box** as an isolated, cloud-side test environment and
**Upstash Redis** as the operational brain (pub/sub, streams, KV, agent fleet
state). A persistent Box container named **`coherent-beagle-67807`** is
provisioned and reused for staging verification — do NOT delete it.

Boxes give us: isolated execution (`box.exec.command`), browser automation
(`box.browser`), file operations (`box.files`), git operations, and staged
testing without local network access.

---

## 2. Credentials & Environment

| Variable | Where it lives | Purpose |
|:---|:---|:---|
| `UPSTASH_BOX_API_KEY` | Heroku staging config vars (verified SET) | Auth for all Box API calls |
| `UPSTASH_BOX_ID` | GitHub Actions secret (optional — auto-resolves) | Pin to `coherent-beagle-67807` |
| `UPSTASH_REDIS_REST_URL` | `.env` / Heroku | Redis REST endpoint (Fast Brain) |
| `UPSTASH_REDIS_REST_TOKEN` | `.env` / Heroku | Redis read/write token |
| `UPSTASH_REDIS_REST_URL_SLOW` | `.env` / Heroku | Redis endpoint (Slow Brain / workers) |
| `UPSTASH_REDIS_REST_TOKEN_SLOW` | `.env` / Heroku | Slow Brain token |

**Secret-safety rules (from `verify:secrets`):** report presence only, never
values. Box key comes ONLY from the environment. Never print, commit, or log
credential values. `.env*` is gitignored except `.env.example` templates.

### How to fetch the Box key WITHOUT exposing it (Heroku API)
```bash
BOX_KEY=$(curl -s -H "Authorization: Bearer $HEROKU_API_KEY" \
  -H "Accept: application/vnd.heroku+json; version=3" \
  "https://api.heroku.com/apps/kudbee-fuel-gage-staging/config-vars" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0)); process.stdout.write(d.UPSTASH_BOX_API_KEY||'')")
```

---

## 3. SDK & Scripts

**SDK:** `@upstash/box@0.6.0` (installed at root; `import { Box } from "@upstash/box"`)

| Script | Purpose |
|:---|:---|
| `scripts/edisbox-deploy.mjs` | Isolated HTTP health check inside a Box before deploy promotion |
| `scripts/edisbox-pipeline.mjs` | Full pipeline verification: key check → box-web-verify → package check → DTHINK feed |
| `scripts/box-web-verify.mjs` | Staging HTTP check inside a Box (`--strict` fails if key absent) |
| `.github/workflows/box-test.yml` | CI workflow — reusable persistent-box test env |

---

## 4. Box SDK API surface (verified working)

```js
import { Box, EphemeralBox } from "@upstash/box";

// List existing boxes (find the persistent one)
const boxes = await Box.list();
// → [{ id: "coherent-beagle-67807", size: "small", keepAlive: false }]

// Get an existing box by ID
const box = await Box.get("coherent-beagle-67807");

// Create a NEW ephemeral box (auto-deletes; short-lived)
const ep = await EphemeralBox.create({ runtime: "node", ttl: 3600 });

// Create a full box
const fresh = await Box.create({ runtime: "node", env: { KEY: "val" }, timeout: 120_000 });

// Run a command inside the box
const run = await box.exec.command("node -v");
// run.status = "completed" | "failed"; run.exitCode; run.stdout; run.stderr; run.result

// Run inline JS/TS code inside the box
const run2 = await box.exec.code({ code: "console.log(1+1)" });

// File operations
await box.files.write({ path: "note.txt", content: "hi" });
const data = await box.files.read("note.txt");
await box.files.list();

// Labels (tie box to purpose)
await box.labels.add("kudbee"); // existing: ["kudbee","browser-verify","test"]

// Status + lifecycle
await box.getStatus();          // "idle" | "paused" | ...
await box.pause();              // release compute, KEEP box (persistent reuse)
await box.resume();
await box.delete();             // DESTROYS the box — do NOT call on persistent box

// Env vars (user-level, masked on read)
await Box.setEnv("K", "v", options);
await Box.listEnv();
```

**Critical:** for the persistent shared box `coherent-beagle-67807`, always
`pause()` in a `finally` block — never `delete()`. Deleting it breaks every
other agent's test environment.

---

## 5. Staging health check recipe (verified)

```js
import { Box } from "@upstash/box";
const box = await Box.get("coherent-beagle-67807");
const target = "https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com";
try {
  const script = [
    `const response = await fetch(${JSON.stringify(target + "/health")});`,
    `const body = await response.json();`,
    `const healthy = response.ok && body.status === "ok" && body.dependencies.redis === "healthy" && body.dependencies.ingestion_db === "healthy";`,
    `console.log(JSON.stringify({ status: response.status, body, healthy }));`,
    `if (!healthy) process.exitCode = 1;`,
  ].join(" ");
  const run = await box.exec.command("node --input-type=module -e " + JSON.stringify(script));
  if (run.status === "failed" || run.exitCode !== 0) process.exit(1);
} finally {
  await box.pause().catch(() => {});  // release compute, keep box alive
}
```

**Expected output:** `{"status":200,"body":{"status":"ok",...,"dependencies":{"ingestion_db":"healthy","vector_memory":"healthy","redis":"healthy"}},"healthy":true}`

---

## 6. Resolving the Box ID (workflow pattern)

The CI workflow resolves the box in this priority:
1. `UPSTASH_BOX_ID` GitHub secret if set → use it
2. Otherwise `Box.list()` → take first box
3. Fail if no boxes exist

---

## 7. Redis setup

- **Two logical instances:** Fast Brain (`REDIS_URL`/`UPSTASH_REDIS_REST_URL`) for
  UI telemetry/SSE/state; Slow Brain (`UPSTASH_REDIS_REST_URL_SLOW`) for workers,
  governance queue, HERMES.
- **Redis MCP** is for operational commands ONLY — never for secret discovery or
  storage.
- **Key namespaces:** `kudbee:*` (events pub/sub), `kudbee-governance-tasks`
  (worker queue, BRPOP 5s), `kudbee-governance-tasks-failed` (DLQ, MAX_ATTEMPTS=3).
- Worker polling: `services/agents/worker.ts` — TCP BRPOP, 5s blocking timeout.
- Circuit breaker: `services/lib/redis.js` — Upstash adaptive breaker at
  `MAX_REQUESTS_LIMIT` (500k).

---

## 8. Gotchas

1. **Never `box.delete()` on `coherent-beagle-67807`** — it's the shared persistent
   test env. `pause()` instead.
2. **`@types/node` 26 broke `crypto.generateKeyPairSync('ed25519')`** — the
   `KeyFormat` union widened. Fix: `const KEY_FORMAT = 'pem' as const;` (see
   `packages/utils/crypto-identity.ts`).
3. **`@vitejs/plugin-react` 6.0.5 needs `vite@8`** — the `./internal` export
   error appears when versions mismatch; keep them paired.
4. **Shell quoting:** when building inline box scripts, use
   `node --input-type=module -e ${JSON.stringify(script)}` to avoid escaping bugs.
5. **Staging URL:** `kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com` (not
   the `-staging` bare domain).
6. **Box is paused by default** — `Box.get()` + `exec` auto-wakes it; always
   pause after.

---

## 9. Verification checklist

```bash
# 1. Box reachable?
node scripts/agents.mjs status | grep -i box   # or:
# via node: Box.list() → coherent-beagle-67807

# 2. Staging healthy?
curl -s https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/health

# 3. Box key configured?
# Heroku API: config-vars contains UPSTASH_BOX_API_KEY (name only)

# 4. CI workflow present?
ls .github/workflows/box-test.yml

# 5. Verify secrets gate passes
npm run verify:secrets
```
