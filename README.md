# Kudbee — Spatial-Fluidic AI Operating System (AI-OS)

<p align="center">
  <strong>Self-sovereign, cost-amortized, self-healing artificial intelligence infrastructure</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white" alt="Node 22"/></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/typescript-7.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript 7"/></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black" alt="React 19"/></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6"/></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind v4"/></a>
  <a href="https://www.heroku.com"><img src="https://img.shields.io/badge/deploy-heroku-430098?logo=heroku&logoColor=white" alt="Heroku"/></a>
  <a href="https://github.com/Kudbee-fuel-gage/kudbee/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"/></a>
  <a href="https://turborepo.org"><img src="https://img.shields.io/badge/build-turborepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo"/></a>
</p>

---

## Overview

Kudbee is a production-grade **Spatial-Fluidic AI Operating System** — a unified monorepo that combines a cognitive kernel with real-time telemetry, self-healing middleware, and a human-in-the-loop governance plane. It models AI agent interactions as receptor-ligand binding events across a 3D coordinate lattice, enforcing deterministic state transitions with cryptographic audit trails.

At the core, a **Receptor Gating Engine** evaluates token affinity against cell-slot coordinates using vector similarity and weighted scoring, while the **FTWB Middleware** (Flow-Through Watchdog Bridge) acts as a Zod-enforced firewall interceptor that quarantines invalid payloads before they reach the runtime. The **Energy Mesh** meters system-wide resource consumption through E(token) decay functions, enabling cost-amortized scheduling across Nash-optimized token unions.

The system is governed by **AGC Contracts** (Agent Governance Contracts) that define enforceable policies for agent behavior, audited by the HERMES auditor and enforced through a staged probation docket. A live **Control Tower dashboard** renders 17+ specialized plugins — from 3D homunculus projection to real-time threat heatmaps — all bound through strict TypeScript/Zod contracts and polled at 5-second intervals via React 19 + Vite.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE UI                                   │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Dashboard │ │ Firewall │ │ Governance│ │ Playground│ │ Cmd+K       │  │
│  │ 17 Plugins│ │ Triage   │ │ Gate      │ │ Shell     │ │ Palette     │  │
│  └───────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│                     AGENT GOVERNANCE                                      │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ AGC Contracts│ │ Nash Unions │ │ Probation   │ │ HERMES Auditor   │   │
│  │ Policy Engine│ │ Token Pools │ │ Docket      │ │ Audit Trail      │   │
│  └──────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│                     COMPUTE INFRASTRUCTURE                                │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ FTWB Firewall│ │ Energy Mesh │ │ P2P Lock    │ │ Circuit Breaker  │   │
│  │ Zod Validate │ │ E(token)    │ │ Registry    │ │ Rate Limiting    │   │
│  └──────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘   │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ Redis/Upstash│ │ Neon/pgvector│ │ Groq LPU    │ │ OTel Telemetry  │   │
│  │ State Layer  │ │ Vector Store│ │ Inference   │ │ Ingestion       │   │
│  └──────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│                     COGNITIVE KERNEL                                      │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ Receptor     │ │ Affinity    │ │ Cell Slot   │ │ Victory Memory  │   │
│  │ Gating Engine│ │ Scoring     │ │ Lattice     │ │ Dictionary      │   │
│  └──────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Purpose | Link |
|:---|:---|:---|
| **Node.js 22** | ESM runtime with native type-stripping | [nodejs.org](https://nodejs.org) |
| **Express** | REST API server for ingestion & governance | [expressjs.com](https://expressjs.com) |
| **tsx** | TypeScript execution for services and scripts | [tsx.is](https://tsx.is) |
| **ioredis / Upstash** | Redis client for state layer, queues, and caching | [upstash.com](https://upstash.com) |
| **pgvector / Neon** | Serverless Postgres with vector similarity search | [neon.tech](https://neon.tech) |
| **Zod** | Runtime schema validation and contract enforcement | [zod.dev](https://zod.dev) |

### Frontend

| Technology | Purpose | Link |
|:---|:---|:---|
| **React 19** | UI framework with concurrent rendering | [react.dev](https://react.dev) |
| **Vite** | Build tool and dev server | [vite.dev](https://vite.dev) |
| **Tailwind CSS v4** | Utility-first CSS framework | [tailwindcss.com](https://tailwindcss.com) |
| **Recharts** | Declarative charting library | [recharts.org](https://recharts.org) |
| **D3** | Data-driven visualization engine | [d3js.org](https://d3js.org) |
| **Motion** | Animation library (formerly Framer Motion) | [motion.dev](https://motion.dev) |
| **Zustand** | Lightweight state management | [zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs) |
| **lucide-react** | Icon library | [lucide.dev](https://lucide.dev) |

### Infrastructure

| Technology | Purpose | Link |
|:---|:---|:---|
| **Heroku** | Cloud application platform | [heroku.com](https://www.heroku.com) |
| **Groq LPU** | High-speed LLM inference | [groq.com](https://groq.com) |
| **Redis** | In-memory state layer and pub/sub | [redis.io](https://redis.io) |
| **Neon Postgres** | Serverless database with pgvector | [neon.tech](https://neon.tech) |
| **Turborepo** | Monorepo build orchestrator | [turbo.build](https://turbo.build) |
| **OTel** | OpenTelemetry tracing and observability | [opentelemetry.io](https://opentelemetry.io) |

---

## Key Features

| Feature | Description | PR |
|:---|:---|:---|
| **Receptor Gating Engine** | Biophysical receptor-ligand affinity model for token-to-cell-slot binding | [#94](https://github.com/Kudbee-fuel-gage/kudbee/pull/94) · [#95](https://github.com/Kudbee-fuel-gage/kudbee/pull/95) |
| **FTWB Middleware & Groq Threat Firewall** | Flow-Through Watchdog Bridge with Zod schema enforcement and Groq-powered anomaly detection | [#104](https://github.com/Kudbee-fuel-gage/kudbee/pull/104) · [#111](https://github.com/Kudbee-fuel-gage/kudbee/pull/111) |
| **P2P Lock Registry** | Distributed lock semantics for critical cell-slot coordinates (Suboxone Effect) | [#96](https://github.com/Kudbee-fuel-gage/kudbee/pull/96) |
| **Nash Token Unions** | Game-theoretic Nash equilibrium pooling for multi-agent token economies | [#120](https://github.com/Kudbee-fuel-gage/kudbee/pull/120) |
| **AGC Contracts** | Agent Governance Contracts — enforceable policy definitions for agent behavior | [#121](https://github.com/Kudbee-fuel-gage/kudbee/pull/121) |
| **Energy Mesh E(token)** | System-wide energy metering with exponential decay and cost-amortized scheduling | [#118](https://github.com/Kudbee-fuel-gage/kudbee/pull/118) |
| **Victory Memory Dictionary** | Semantic memory storage with vector recall for agent session history | [#110](https://github.com/Kudbee-fuel-gage/kudbee/pull/110) |
| **Staged Probation** | Progressive disciplinary framework for misbehaving agents with docket tracking | [#123](https://github.com/Kudbee-fuel-gage/kudbee/pull/123) |
| **3D Homunculus Projector** | Spatial 3D visualization of agent states projected onto a coordinate lattice | [#122](https://github.com/Kudbee-fuel-gage/kudbee/pull/122) |
| **17 Dashboard Plugins** | Modular control tower plugins: Think Storm, Stream, Storage, Trajectories, Governance Gate, HERMES Auditor, Health Matrix, Threat Heatmap, Energy Decay, Token Dictionary, Union Monitor, Edge Sentinel, Anomaly Feed, Contract Monitor, Probation Docket, Alerts Panel, Interceptor Triage | — |
| **Cmd+K Command Palette** | Keyboard-driven command palette for rapid navigation and agent control | [#98](https://github.com/Kudbee-fuel-gage/kudbee/pull/98) |
| **Circuit Breaker** | Automatic service degradation when failure thresholds are exceeded | [#115](https://github.com/Kudbee-fuel-gage/kudbee/pull/115) |
| **Tenant-Aware Rate Limiting** | Multi-tenant rate limiting with Redis-backed token buckets | [#116](https://github.com/Kudbee-fuel-gage/kudbee/pull/116) |
| **Agent Audit Layer** | Cryptographic audit trail with hashed state transitions and event replay | [#205](https://github.com/Kudbee-fuel-gage/kudbee/pull/205) |

---

## Getting Started

### Prerequisites

- **Node.js 22** with ESM support
- **npm 10.9+** (package manager)
- A **Neon Postgres** database with pgvector extension
- A **Redis** instance (Upstash recommended)
- (Optional) **Groq API key** for LPU inference
- (Optional) **Gemini API key** for embedding generation

### Environment Setup

Copy the canonical environment template and fill in your values:

```bash
cp config/template.env .env
```

Required variables: `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `APP_URL`, `REACT_APP_API_URL`, `CORS_ALLOW_ORIGINS`, `PORT`, `NODE_ENV`.

### Install & Run

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run typecheck
```

```bash
node scripts/verify-e2e.mjs
```

The `dev` command starts all workspaces via Turborepo — the ingestion server, monitor agent, worker, and Vite dev server for the Control Tower dashboard.

---

## Verification Suite

All verification scripts live in `scripts/` and can be run independently from the repo root.

| Script | Purpose |
|:---|:---|
| `scripts/verify-e2e.mjs` | 11/11 end-to-end checks — spawns server, validates ingestion, governance, and telemetry pipelines |
| `scripts/diagnose-redis.mjs` | Reports Redis connectivity and latency |
| `scripts/boot-verify.mjs` | Pre-release environment validation (run automatically on Heroku release) |
| `scripts/verify-flow.mjs` | Full transaction flow: ingest → validate → persist → recall |
| `scripts/verify-receptor-gating.mjs` | Verifies receptor-ligand affinity scoring and binding logic |
| `scripts/verify-energy-mesh.mjs` | Tests E(token) decay functions and energy metering |
| `scripts/verify-governance-loop.mjs` | End-to-end HITL governance: propose → approve/reject → enforce |
| `scripts/verify-think-loop.mjs` | Validates think archival flow (code → verify → archive) |
| `scripts/verify-vector-search.mjs` | Tests pgvector cosine similarity recall and fallback behavior |
| `scripts/verify-system-integrity.mjs` | Schema contract compliance and cryptographic audit trail integrity |
| `scripts/verify-resilience.mjs` | Resilient-First degradation tests — DB/Redis/LLM failure scenarios |
| `scripts/verify-middleware-chaos.mjs` | FTWB firewall chaos testing with malformed payload injection |
| `scripts/verify-crucible-interceptor.mjs` | Crucible adversarial challenge harness against active cell slots |
| `scripts/verify-adversarial-challenge.mjs` | Synthetic perturbation and prompt injection stress tests |
| `scripts/verify-drift.mjs` | Schema drift detection and type-contract reconciliation |
| `scripts/traffic-sim.mjs` | High-throughput traffic simulator (200ms interval, throttle-aware) |
| `scripts/dashboard-load-sim.mjs` | Dashboard concurrency load tester |
| `scripts/deploy-check.ts` | Pre-deployment readiness check (TypeScript) |
| `scripts/ingest-topology.ts` | Self-ingestion pipeline — chunks, embeds, and seeds the system topology vector store |
| `scripts/auto-commit.mjs` | Runs E2E suite, auto-commits on pass, and opens a PR (requires `GITHUB_TOKEN`) |
| `scripts/init-project-memory.mjs` | Initializes the project memory layer from PR session manifests |
| `scripts/log-session.mjs` | Logs session metadata to Redis for the dashboard timeline |

---

## Roadmap

### UI/UX Overhaul (In Progress)
A comprehensive redesign of the Control Tower dashboard for improved information density, responsive layouts, and accessibility.

- [#200](https://github.com/Kudbee-fuel-gage/kudbee/pull/200) — Dashboard layout refactor and grid system
- [#201](https://github.com/Kudbee-fuel-gage/kudbee/pull/201) — Plugin card redesign with collapsible panels
- [#202](https://github.com/Kudbee-fuel-gage/kudbee/pull/202) — Dark/light theme engine
- [#203](https://github.com/Kudbee-fuel-gage/kudbee/pull/203) — Keyboard navigation and focus management
- [#204](https://github.com/Kudbee-fuel-gage/kudbee/pull/204) — Accessibility audit and ARIA compliance

### Swarm Visualizer
A real-time force-directed graph rendering agent swarm topologies, token flow, and inter-agent communication pathways using D3 and Recharts.

### Groq Auto-Diagnostic
Automated LPU diagnostic pipeline — detects inference anomalies, measures token-per-second degradation, and triggers circuit-breaker fallback to alternative providers.

### Mobile Responsiveness
Adaptive layout system for the Control Tower dashboard on tablet and mobile viewports, with touch-optimized plugin controls and gesture-based navigation.

### Phase 5 — The Anchor (Offline-First Resilience)
Complete offline-first architecture with service-worker caching, local state reconciliation, and seamless re-sync when connectivity is restored.

### Phase 6 — P2P Swarm Memory Sync
Distributed memory synchronization across repos, preview environments, and peer nodes using Kademlia DHT routing and DiLoCo-style outer-momentum gradient synchronization.

---

## License

[MIT](https://github.com/Kudbee-fuel-gage/kudbee/blob/main/LICENSE)

Copyright © 2026 Kudbee.
