/**
 * services/sentinel/src/index.ts
 * ---------------------------------------------------------------------------
 * Edge Sentinel entry point.
 *
 * 1. Binds an ultra-lightweight native HTTP health-check server to
 *    `process.env.PORT || 3001` (Heroku free-tier keep-alive boundary). It
 *    serves strictly `200 OK - Edge Sentinel Active` on `/` and consumes
 *    near-zero compute — its only purpose is to prevent dyno termination.
 * 2. Starts the Signal-to-Noise ingestion heartbeat (see poller.ts).
 *
 * No frameworks; native `http` + `fetch` only. Optimized for fast cold starts.
 * ---------------------------------------------------------------------------
 */

import http from 'node:http';
import { startPoller } from './poller.ts';

const PORT = Number(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end('200 OK - Edge Sentinel Active');
});

server.listen(PORT, HOST, () => {
  console.log(`[Sentinel] health boundary listening on http://${HOST}:${PORT}/`);
  startPoller();
});
