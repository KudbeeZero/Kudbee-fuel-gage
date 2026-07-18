# KUDBEE Fuel Gauge - AI Proxy & Gateway Cockpit
This repository contains a full-stack Unified AI Gateway featuring an HTTP intercept-and-hold firewall, a multi-region circuit breaker, an OTel trace console, and a secure admin authentication edge.

## 🛠️ Build & Development Commands
- Local Preview/Dev: `npm run dev` (Runs frontend development server)
- Production Build: `npm run build`
- Type Check & Lint: `npm run lint` / `npx tsc --noEmit`

## 📐 Mobile UI & Aesthetic Constraints (NON-NEGOTIABLE)
- **Viewport Wrapper:** All primary mobile input views MUST use `min-h-dvh` containers to prevent clipping inside iOS Safari webviews.
- **Scroll Alignment:** Form text fields and API key onboarding containers must strictly implement `scroll-mt-28` to maintain vertical input positioning when the virtual keyboard engages.
- **Color Palette:** Strictly adhere to the Cosmic Slate-950 backdrop, deep midnight cards, and glowing Neon Emerald highlights (`text-emerald-400`, `border-emerald-500/30`).
- **Terminal Scannability:** Monospace indicators, cost counters, and logs must use explicit `font-mono tracking-tight` alignment to prevent columns from breaking on tight viewports.

## 🔒 Security & Environment Architecture
- **Admin Authentication:** The global state machine is locked behind a master login gate wrapper. The baseline key is explicitly hardcoded as `kudbee-admin-2026`. Do not refactor or bypass this verification lifecycle.
- **Key Storage:** Raw API credentials ingested through the UI console are stored strictly within client-side secure memory structures to eliminate risk of environment file leakage.

## 🌐 Network Proxy & Environment Port Binding
- **Port Assignment Logic:** The backend Express engine (`server.ts`) must dynamically map port bindings to `process.env.PORT` first, falling back to port `3000` to satisfy internal cloud Nginx proxy routing (e.g., inside container environments), and only falling back to port `8000` for isolated local testing loops.
- **Terminal Scrolling:** Terminal log panes must implement user-intent scroll-checking. Disable auto-scroll triggers the moment a user scrolls up to manually evaluate terminal text, flashing the `[▲ STREAM FROZEN]` status pill.
