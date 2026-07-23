# FULFILLED OUTING — 20-Phase Enterprise Hardening Plan

Branch: `feat/fulfilled-outing` | Date: 2026-07-23

## PHASE 1: PLUGIN ECOSYSTEM — Complete Audit & Hardening

### 1A: Think Plugin Suite (4 plugins)
**Target:** ThinkStormPlugin, ThinkStreamPlugin, ThinkStoragePlugin, ThinkTrajectoriesPlugin
- 1A.1 Add PanelErrorBoundary wrappers to all 4
- 1A.2 Add mountedRef guards on all async setState calls
- 1A.3 Add empty/loading/error states (currently render blank on empty data)
- 1A.4 Fix ThinkStoragePlugin `token_hash` renders "undefined" bug
- 1A.5 Fix ThinkTrajectoriesPlugin JSON.stringify crash on circular task_context
- 1A.6 Audit all useEffect for missing cleanup
- 1A.7 Add proper TypeScript types (remove any casts)

### 1B: Governance Plugin Suite (3 plugins + 3 sub-components)
**Target:** GovernanceGatePlugin, HermesAuditorPlugin, EdgeSentinelPlugin
- 1B.1 GovernanceGatePlugin: Add PROVEN badge (amber→violet color transition)
- 1B.2 GovernanceGatePlugin: Add claim/lock mechanism for concurrent HITL approval
- 1B.3 HermesAuditorPlugin: Add audit trail viewer with pagination
- 1B.4 EdgeSentinelPlugin: Add ingress/egress throughput visualization
- 1B.5 AutoTuneButton: Add progress stages (analyzing → tuning → applying)
- 1B.6 PolicyEnginePanel: Add policy simulation mode (dry-run)
- 1B.7 GovernanceQueueTray: Add batch approve/reject

## PHASE 2: GATEWAY & NETWORK LAYER — Visualization & Reliability

### 2A: Gateway Components (4 components)
**Target:** GatewayView, ProviderKeyCard, ProviderStatusGrid, RoutingVisualizer
- 2A.1 ProviderStatusGrid: Add live latency indicators with auto-refresh
- 2A.2 ProviderKeyCard: Add key rotation reminder + expiry countdown
- 2A.3 RoutingVisualizer: Add animated packet flow visualization
- 2A.4 GatewayView: Add circuit breaker status indicators (groq/gemini/redis)

### 2B: Network Switch Visualizer
**Target:** Create new NetworkSwitch tab page
- 2B.1 Create `pages/network.tsx` — unified network health dashboard
- 2B.2 Real-time port status: PG (5432), Redis (6379), SSE (event stream)
- 2B.3 Provider latency matrix with color-coded health
- 2B.4 Connection pool utilization gauge (active/idle/max)
- 2B.5 Rate limit remaining countdown per tier
- 2B.6 Add NETWORK tab to App.tsx navigation

## PHASE 3: PLAYGROUND & SANDBOX — Enterprise Lab Bench

### 3A: Playground Components (5 components)
**Target:** PlaygroundView, CostAnalysisPanel, MultiModelSelector, RagContextDrawer, TokenEstimator
- 3A.1 PlaygroundView: Add session persistence (localStorage save/restore)
- 3A.2 CostAnalysisPanel: Real-time cost projection with budget gauge
- 3A.3 MultiModelSelector: Add model capability matrix (vision, code, reasoning, tool-use)
- 3A.4 RagContextDrawer: Add similarity score heatmap for retrieved chunks
- 3A.5 TokenEstimator: Replace naive `text.length / 4` with real tokenizer (tiktoken)
- 3A.6 PlaygroundView: Add A/B comparison mode (side-by-side models)
- 3A.7 Add per-model usage statistics and cost history

### 3B: Intelligence & Interceptor
**Target:** IntelligenceView, InterceptorView, GroundedIntelligenceComponent
- 3B.1 IntelligenceView: Add agent vitals (queue size, circuit status, heartbeats)
- 3B.2 InterceptorView: Add intercept rule editor with regex validation
- 3B.3 GroundedIntelligenceComponent: Add confidence score visualization

## PHASE 4: MONITORING & TELEMETRY — Full Observability

### 4A: Live Monitoring Dashboard
**Target:** TelemetryPage, LatencyHistogram, TerminalHUDTicker, DiagnosticTicker
- 4A.1 LatencyHistogram: Add p50/p95/p99 percentile markers
- 4A.2 TerminalHUDTicker: Replace static text with live SSE data
- 4A.3 DiagnosticTicker: Add anomaly detection highlights
- 4A.4 TelemetryPage: Add time-range selector (1h, 6h, 24h, 7d)

### 4B: Alerting System
**Target:** AlertsPanel, GovernanceToast
- 4B.1 AlertsPanel: Add alert priority levels (CRITICAL/HIGH/MEDIUM/LOW)
- 4B.2 AlertsPanel: Add alert acknowledgment workflow
- 4B.3 GovernanceToast: Add auto-dismiss with configurable timeout
- 4B.4 GovernanceToast: Add toast stacking (max 5 visible)
- 4B.5 Create `components/ToastContainer.tsx` — centralized toast manager

## PHASE 5: HISTORY & LOGS — Audit Trail Completeness

### 5A: History Systems
**Target:** HistoryPage, ThinkPage (trajectories), AuditVaultCard, DLQInspector
- 5A.1 HistoryPage: Add advanced filters (provider, model, status, date range)
- 5A.2 HistoryPage: Add export functionality (CSV, JSON)
- 5A.3 AuditVaultCard: Add cryptographic verification of audit chain
- 5A.4 DLQInspector: Add dead-letter retry and inspection UI
- 5A.5 ThinkPage: Add trajectory replay (step-through animation)
- 5A.6 ThinkPage: Add trajectory comparison (diff two trajectories)

## PHASE 6: TERMINAL & COMMAND — Shell Experience

### 6A: Ollama Terminal Integration
**Target:** OllamaChat, TerminalStreamView, ThinkingBlock, StreamModeBadge
- 6A.1 OllamaChat: Add model switcher dropdown (qwen3, llama3.2, mistral, etc.)
- 6A.2 OllamaChat: Add session history with search
- 6A.3 TerminalStreamView: Add syntax highlighting for code blocks
- 6A.4 ThinkingBlock: Add thought chain collapse/expand animation
- 6A.5 StreamModeBadge: Add tool execution status indicators

### 6B: Mobile UI Shell (COMPLETED)
**Target:** apps/mobile — Expo 52 + React Native
- 6B.1 Created root layout with Expo Router tab navigator
- 6B.2 Implemented Dashboard screen with DashboardCard grid and quick-action buttons
- 6B.3 Implemented Terminal screen with command dispatch chips and live command log
- 6B.4 Implemented Governance screen with pending approval cards and status badges
- 6B.5 Implemented Settings screen with configuration rows and action buttons
- 6B.6 Wired command SDK into Dashboard and Terminal views

### 6C: Mobile Runtime Config (COMPLETED)
- 6C.1 Replaced hardcoded Heroku URL with runtime API_URL resolution
- 6C.2 Integrated expo-constants extra.apiUrl from app.json
- 6C.3 Added process.env.API_URL fallback and localhost:9900 default
- 6C.4 Health check hits local BootVerify server

### 6D: Mobile Command SDK (COMPLETED)
**Target:** apps/mobile/src/sdk/ + mobile-friendly Zustand store
- 6D.1 Created apiClient.ts mirroring web with AbortController timeouts
- 6D.2 Implemented exponential backoff on 429/503 with Retry-After / X-RateLimit-Reset headers
- 6D.3 Created 11 async command functions matching web commandRunners
- 6D.4 Built useCommandStore.ts with IDLE/RUNNING/SUCCESS/FAILED states
- 6D.5 Wired hermesAudit, systemProbe, crucibleDispatch, and purge into Terminal chips
- 6D.6 Wired quick-run actions into Dashboard with success/failure detail logging

### 6E: Command Palette & Control Bar
**Target:** OSControlBar, WorkspaceBar
- 6E.1 OSControlBar: Add workspace switcher dropdown
- 6E.2 OSControlBar: Add tenant-aware command palette
- 6E.3 WorkspaceBar: Add tenant/workspace CRUD

## PHASE 7: DESKTOP & LAYOUT — Professional OS Shell

### 7A: Core Shell Components
**Target:** RackLayout, PluginCard, AgenticRack, OsStreamProvider
- 7A.1 RackLayout: Add drag-and-drop plugin reordering
- 7A.2 PluginCard: Add resize handles (min/max width)
- 7A.3 AgenticRack: Add rack health indicators per slot
- 7A.4 OsStreamProvider: Add reconnection count tracker
- 7A.5 Add global keyboard shortcut registry (Cmd+1-9 for tabs)

### 7B: Responsive & Accessibility
**Target:** All components — sweep for a11y and mobile
- 7B.1 Add aria-labels to all interactive elements (50+ components)
- 7B.2 Add focus trapping to modals (PluginManagerModal, CommandPalette)
- 7B.3 Add skip-to-content link for keyboard navigation
- 7B.4 Fix mobile overflow on all pages (min-w-0 audit)
- 7B.5 Add touch-friendly tap targets (min 44px)

## PHASE 8: DATA PIPELINE — Storage & Retrieval

### 8A: Plugin Backend (4 plugins)
**Target:** AgenticRag/index.ts, CommunityLedger/index.ts, LiveTelemetry/index.ts, VectorStore/index.ts
- 8A.1 AgenticRag: Add chunk retry counter (track failed chunk fetches)
- 8A.2 CommunityLedger: Wire to real data (currently placeholder)
- 8A.3 LiveTelemetry: Add stream pause/resume
- 8A.4 VectorStore: Add index health check (pgvector index validity)

### 8B: Web Workers & Background Processing
**Target:** workers/dataCruncher.worker.ts, useEdgeWorker
- 8B.1 dataCruncher: Add worker pool size config
- 8B.2 dataCruncher: Add task priority queue
- 8B.3 useEdgeWorker: Add worker crash recovery
- 8B.4 useEdgeWorker: Add worker telemetry (tasks/second, avg latency)

## PHASE 9: SERVICES — Backend Completeness

### 9A: Memory & Think Pipeline
**Target:** services/memory/* — vectorStore, thinkTokenGenerator, embedText, pcaReducer
- 9A.1 vectorStore: Add LRU cap to memoryStore (10K entries)
- 9A.2 thinkTokenGenerator: Use Gemini embedText (not local hash)
- 9A.3 embedText: Add retry logic to Gemini API call
- 9A.4 pcaReducer: Fix empty vectors → Math.max(-Infinity) crash

### 9B: Governance & Security
**Target:** services/governance/*, services/agents/*
- 9B.1 governance/router: Add atomic Redis EVAL for approveAction
- 9B.2 governance/ledger: Add unbounded localQueue cap
- 9B.3 agents/worker.ts: Remove shouldFail production hook
- 9B.4 agents/worker.ts: Add types for Task/TaskPayload
- 9B.5 receptorGating: Add lockStore TTL eviction (30min)

## PHASE 10: FINAL VERIFICATION — CI Green + Docs Complete

### 10A: CI & Build
- 10A.1 Run `npm run typecheck` across all workspaces
- 10A.2 Fix any remaining TypeScript errors
- 10A.3 Run `npm run build` on web workspace
- 10A.4 Verify all 36 E2E checks pass

### 10B: Documentation
- 10B.1 Update STATE_OF_THE_OS.md with Phase 1-10 changes
- 10B.2 Update BUILD.md with new tabs and components
- 10B.3 Update claude.md with full architecture map
- 10B.4 Create 07-NETWORK_AND_GATEWAY.md
- 10B.5 Create 08-TERMINAL_AND_COMMAND.md
- 10B.6 Create 09-PLAYGROUND_AND_SANDBOX.md
- 10B.7 Push + Create final PR
