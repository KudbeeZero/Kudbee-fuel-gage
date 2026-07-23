# Total memory budget: ~1.5GB across 5 dynos. Ensure Heroku dyno has ≥2GB RAM.
release: node --max-old-space-size=256 scripts/boot-verify.mjs
web: npx tsx --max-old-space-size=512 services/ingestion/server.js
monitor-worker: node --max-old-space-size=256 services/monitor/agent.js
hermes-worker: node --max-old-space-size=256 worker.js
sentinel: npx tsx --max-old-space-size=256 services/sentinel/src/index.ts
