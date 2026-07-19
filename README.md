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
*   **Stack:** Node.js, Express, SQLite, OTel SDK, Turborepo.
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

## ⚖️ License
**© 2026 Kudbee. All Rights Reserved.**

This software, including all source code, documentation, and architectural designs, is **Proprietary**. Unauthorized copying, distribution, or use of this software—in whole or in part—without express written permission from the copyright holder is strictly prohibited. This project is not open-source; all rights are reserved.
