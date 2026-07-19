# Kudbee | AI Telemetry & Orchestration Engine 🚀

Kudbee is a production-grade observability and agentic orchestration platform designed for high-concurrency LLM workflows. We solve the "congestion" of massive AI throughput by implementing a deterministic, stateful, and predictive architecture.

![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)

---

## 🏗️ Architectural Roadmap

This project follows a 5-phase execution plan designed to move from basic telemetry to an autonomous, resilient orchestration platform.

| Phase | Title | Focus |
| :--- | :--- | :--- |
| **01** | **The Foundation** | Data Ingestion & Service-Oriented Monorepo |
| **02** | **The Gate** | API Gateway & Middleware Firewall |
| **03** | **The Brain & Hands** | LangGraph Orchestration & n8n Automation |
| **04** | **The Tunnel** | Predictive Execution & Vector Memory |
| **05** | **The Anchor** | Offline-First Resilience & Cross-Platform UI |

### Phase 1 — The Foundation
*   **Goal:** Harden ingestion and normalize the monorepo structure.
*   **Stack:** Node.js, Express, Neon Postgres (resilient `pg.Pool`), Redis, OTel SDK, Turborepo.
*   **Status:** [x] CI/CD pipeline active. [x] Telemetry ingestion live.

### Phase 2 — The Gate
*   **Goal:** Central API Gateway with schema-enforced "Firewall."
*   **Strategy:** Zod-based contract enforcement. Any payload that violates the schema is quarantined in the `InterceptorView`.

### Phase 3 — The Brain & Hands
*   **Goal:** Stateful orchestration via LangGraph (Reasoning) and n8n (Execution).
*   **Strategy:** Secured handoffs. No agent process can trigger n8n without a signed, firewall-validated payload.

### Phase 4 — The Tunnel
*   **Goal:** Predictive execution & Async Pub/Sub.
*   **Strategy:** Replace blocking validations with parallel, asynchronous pipelines. Vector-based memory for semantic recall of past agent states.
*   **Status:** [x] Vector memory layer (`services/ingestion` + `embedder.js`) live with cosine-similarity recall.

### Phase 5 — The Anchor (Control Tower)
*   **Goal:** Offline-First Resilience & a data-dense Control Tower dashboard.
*   **Strategy:** `apps/web` dashboard with live System Health, real-time Telemetry Feed (interceptor triage), and Memory Insights (semantic recall), polling every 5s via a `useInterval` hook.

---

## 🛡️ Cross-Cutting Governance

*   **Contract First:** All inter-service communication follows strictly typed Zod/Pydantic schemas defined in `@platform/types`.
*   **Observability:** Every phase ships OTel traces back to the ingestion endpoint.
*   **Security:** The Proprietary Firewall is the system invariant. No service may accept unvalidated cross-boundary input.

---

## 🧰 Configuration & Verification

### Environment configuration (`config/`)
All environment-specific configuration lives in `config/`:

*   **`config/template.env`** — canonical template listing **every** required
    secret/var (`GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `GITHUB_TOKEN`,
    `APP_URL`, `REACT_APP_API_URL`, `CORS_ALLOW_ORIGINS`, `PORT`, `NODE_ENV`).
    Copy it to `.env` and fill in the placeholders, or inject the values via your
    hosting provider's Secrets panel. **No real secrets are stored in the repo.**
*   **`config/.env.example`** — legacy example (kept for compatibility).

The ingestion server is **Resilient-First**: if `DATABASE_URL` or `REDIS_URL` are
unset or unreachable, it logs a clear warning and degrades (in-memory store /
no cache) instead of crashing.

### Verification bundle (`scripts/`)
Run these from the repo root to prove system integrity at any time:

```bash
node scripts/verify-e2e.mjs     # 11/11 end-to-end checks (spawns the server)
node scripts/diagnose-redis.mjs # advisory: reports Redis reachability
node scripts/auto-commit.mjs    # verify → auto-commit → open PR (needs GITHUB_TOKEN)
```

`auto-commit.mjs` runs the E2E suite first; if it passes and there are changes,
it commits them on a feature branch and opens a PR against `main`. A failing E2E
run aborts with no force-commit.

---

## ⚖️ License
**© 2026 Kudbee. All Rights Reserved.**

This software, including all source code, documentation, and architectural designs, is **Proprietary**. Unauthorized copying, distribution, or use of this software—in whole or in part—without express written permission from the copyright holder is strictly prohibited. This project is not open-source; all rights are reserved.
