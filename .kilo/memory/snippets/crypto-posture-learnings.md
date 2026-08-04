# Crypto Posture & Learnings — KUDBEE

> **Status:** VERIFIED — 2026-08-04
> **Gate:** `npm run verify:crypto` (all PASS)
> **Runtime:** Node 22+ / OpenSSL FIPS-aware

---

## Current Crypto Stack

| Capability | Implementation | Purpose |
|:---|:---|:---|
| **Agent identity** | `packages/utils/crypto-identity.ts` — ed25519 | Signs agent payloads; verify() authenticates agents |
| **Runtime gate** | `scripts/verify-crypto-runtime.mjs` | Confirms Node 22+, OpenSSL, hashes, ciphers, HMAC timing-safe, ed25519, FIPS mode |
| **Secret hygiene** | `scripts/verify-secret-hygiene.mjs` | No secrets in tracked files; name-only presence reporting |
| **TLS transport** | Heroku + HSTS + Strict-Transport-Security header | All traffic HTTPS, 31536000s HSTS |
| **HMAC (timing-safe)** | `crypto.timingSafeEqual` | Constant-time comparisons only |
| **Ciphers** | aes-256-gcm, chacha20-poly1305 available | AEAD ciphers for payloads |

---

## Hard-Earned Learnings (from real incidents)

### 1. `@types/node` 26 broke ed25519 typecheck
**Incident:** dependabot bump 22→26 caused `crypto-identity.ts(18,64)` TS2769.
**Root cause:** `KeyFormat` union widened to include `"jwk" | "raw-*"`; the
literal `'pem'` typed as `crypto.KeyFormat` no longer matched
`PublicKeyExportOptions` format.
**Fix (permanent):** `const KEY_FORMAT = 'pem' as const;` — the literal type
works across node 22 AND 26. Never type `KEY_FORMAT` as `crypto.KeyFormat`.

### 2. Security gates were false-positive blocking legit traffic
**Incident:** C4769 synapse gate blocked browser POSTs (no agent headers) →
SYNAPSE_REJECTED 403 on stream-ticket, QStash deliveries.
**Learning:** behavior-gates must exempt trusted channels (browser UI paths,
QStash webhooks). The gate is for ABUSE, not for legitimate clients. Crypto
verification (signature checks) is the real boundary, not behavioral heuristics.

### 3. Express 5 catch-all syntax changed
`app.get('*')` → PathError on boot. **Fix:** `app.get('/{*path}')`.
Any new route file must use named wildcard syntax.

### 4. Never store secrets in .env committed
`.env*` is gitignored except templates. Redis MCP is ops-only. Verify with
`npm run verify:secrets` before pushing.

---

## How the notes feed the loop

1. **Gate** → `verify:crypto` runs in CI + self-heal (every 6h).
2. **Incident** → failure is signature-matched in `heal-patterns.json`
   BEFORE Gemini — known crypto issues recalled from memory (zero LLM cost).
3. **THINK token** → every new fix is minted + fed to DTHINK.
4. **This card** → recalled by agents via snippet recall when touching crypto.
5. **Terminal** → `/crypto` command shows live posture (see below).

---

## Terminal integration

```
/crypto   → { type: 'crypto:posture', node, openssl, ed25519, fips, hashes, ciphers }
```

- Agents use `/crypto` before any signature/key work.
- Self-heal gates include `verify:crypto` — a crypto regression triggers
  Gemini diagnosis automatically.

---

## Verification checklist

```bash
npm run verify:crypto      # runtime crypto gate (must PASS)
npm run verify:secrets     # no secrets in tracked files
node scripts/self-heal.mjs check   # includes crypto gate
```
