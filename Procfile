release: node scripts/boot-verify.mjs
web: cd services/ingestion && npx tsx server.js
worker: node services/monitor/agent.js
worker: node worker.js
sentinel: node --watch services/sentinel/src/index.ts
