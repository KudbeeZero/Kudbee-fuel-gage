# Kudbee Constitutional Law

This document codifies the engineering standards for all future development on the Kudbee-fuel-gage repository. Every agent instance—whether Flash or Pro—must adhere to these principles.

## 1. PR Lifecycle Protocol

Every task requires the complete PR lifecycle:
1. **Branch** — Create a feature branch off `main`
2. **Commit** — Stage and commit changes with descriptive messages
3. **Push** — Push the branch upstream
4. **PR** — Open a pull request with a structured body
5. **Merge** — Merge the PR into `main`
6. **Delete** — Delete both the local and remote branch

**NO direct pushes to `main`.** All changes must flow through the PR lifecycle.

## 2. State Management

Redis is the state layer. Never hardcode state. Always read/write to `kudbee:...` namespaces.

- **Telemetry Feed:** `kudbee:telemetry_feed` (LPUSH/LTRIM)
- **Governance Ledger:** `kudbee:governance_actions` (ZADD with timestamp score)
- **Community Metrics:** `kudbee:community_value_score`, `kudbee:governance_count`, `kudbee:verified_traces`
- **Agent Memory:** `kudbee:system:context` (no TTL, persists indefinitely)
- **Session History:** `kudbee:session_history` (LPUSH, no TTL)
- **Alerts:** `kudbee:alerts` (LPUSH)
- **Backpressure:** `kudbee:throttle_factor` (SET/DEL)

All backend services must use `ioredis` with connection pooling and retry strategies.

## 3. Type Safety

TypeScript + Zod schemas are mandatory. All telemetry events must be validated at runtime.

- Define schemas in `packages/types/index.ts`
- Validate all inbound payloads using Zod before processing
- Use TypeScript strict mode across all workspaces
- Never bypass type checking with `any` or `@ts-ignore`

## 4. Memory Layer

Every successful PR must include a `### Struggles & Friction` section in the PR body to be consumed by the Session Logger.

This section must:
- List any obstacles encountered during implementation
- Describe workarounds or solutions applied
- Serve as training data for future agent instances

The Session Logger workflow (`.github/workflows/session-log.yml`) automatically extracts this section and persists it to `kudbee:session_history`.

## 5. Architecture Philosophy

**"Self-Observing, Self-Healing, Self-Logging."**

- **Self-Observing:** The system monitors its own health via `/api/health-check` and `/api/session-history`
- **Self-Healing:** The agent shell detects failure rates >50% and automatically throttles ingress via `kudbee:throttle_factor`
- **Self-Logging:** Every PR merge generates a session manifest with lessons learned for future agents

## 6. Performance Standards

- All cryptographic verification + Redis write loops must remain under **200ms**
- Dashboard polling interval: **5 seconds**
- Traffic simulator interval: **200ms** (throttle-aware)
- Rolling window for failure rate tracking: **60 seconds**

## 7. Deployment Standards

- **Heroku Procfile** must include both:
  - `web: node services/ingestion/server.js`
  - `worker: node services/monitor/agent.js`
- All environment variables must be injected via GitHub Actions secrets
- Never commit secrets or API keys to the repository
