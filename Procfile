release: node --max-old-space-size=256 scripts/boot-verify.mjs
web: cd services/ingestion && npx tsx --max-old-space-size=512 server.js
monitor-worker: node --max-old-space-size=256 services/monitor/agent.js
hermes-worker: node --max-old-space-size=256 worker.js
sentinel: node --max-old-space-size=256 --watch services/sentinel/src/index.ts
