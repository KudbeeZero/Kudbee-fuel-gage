#!/usr/bin/env node
/**
 * scripts/serial-bus.mjs
 * ---------------------------------------------------------------------------
 * Serial Event Bus — the central nervous system connecting all terminal
 * agents, the cache, the bridge, and the UI. Agents publish events, other
 * agents subscribe and react. Messages are processed sequentially (serial)
 * to guarantee ordering. Events persist for replay and audit.
 *
 * Architecture:
 *   Bus → Topics → Subscribers → Sequential dispatch → Callbacks
 *   Events stored in .kilo/memory/bus/ for replay + UI polling
 *
 * Topics:
 *   agent:run          Agent execution started
 *   agent:complete     Agent execution finished
 *   agent:error        Agent execution failed
 *   agent:decide       Decision logged
 *   agent:recall       Knowledge recalled
 *   cache:warm         Cache pre-warmed
 *   cache:flush        Cache flushed
 *   knowledge:inject   Snippet injected into Think Token Forge
 *   knowledge:relate   New relationship created
 *   middleware:degrade Middleware guard bypassed
 *   middleware:recover Middleware guard recovered
 *   session:bootstrap  Session started
 *   session:end        Session ending
 *   system:health      Health check completed
 *
 * Usage:
 *   node scripts/serial-bus.mjs listen            Watch live bus activity
 *   node scripts/serial-bus.mjs history            Show recent events
 *   node scripts/serial-bus.mjs publish <t> <d>    Publish an event
 *   node scripts/serial-bus.mjs stats              Bus statistics
 *   node scripts/serial-bus.mjs replay             Replay all events in order
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const BUS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'bus');
const BUS_INDEX = join(BUS_DIR, 'index.json');
const MAX_EVENTS = 500;

mkdirSync(BUS_DIR, { recursive: true });

// ─── Subscribers ───────────────────────────────────────────────────────────

const subscribers = new Map();

export function subscribe(topic, callback) {
  if (!subscribers.has(topic)) subscribers.set(topic, []);
  subscribers.get(topic).push(callback);
  return () => {
    const list = subscribers.get(topic) || [];
    subscribers.set(topic, list.filter(cb => cb !== callback));
  };
}

export function unsubscribe(topic, callback) {
  const list = subscribers.get(topic) || [];
  subscribers.set(topic, list.filter(cb => cb !== callback));
}

// ─── Event Store ───────────────────────────────────────────────────────────

export function publish(topic, data = {}, source = 'terminal') {
  const event = {
    id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    topic,
    source,
    data,
    timestamp: new Date().toISOString(),
    sequence: getNextSequence(),
  };

  // Store to disk
  try {
    const path = join(BUS_DIR, `${event.id}.json`);
    writeFileSync(path, JSON.stringify(event, null, 2), 'utf8');
    updateIndex(event);
  } catch {}

  // Dispatch to subscribers (sequential)
  const subs = subscribers.get(topic) || [];
  for (const cb of subs) {
    try { cb(event); } catch (err) {
      const errorEvent = {
        id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        topic: 'system:error',
        source: 'serial-bus',
        data: { originalTopic: topic, error: err.message },
        timestamp: new Date().toISOString(),
        sequence: getNextSequence(),
      };
      try {
        const path = join(BUS_DIR, `${errorEvent.id}.json`);
        writeFileSync(path, JSON.stringify(errorEvent, null, 2), 'utf8');
      } catch {}
    }
  }

  // Also dispatch to wildcard subscribers
  const wildcard = subscribers.get('*') || [];
  for (const cb of wildcard) {
    try { cb(event); } catch {}
  }

  return event;
}

// ─── Index management ─────────────────────────────────────────────────────

function getIndex() {
  try {
    if (existsSync(BUS_INDEX)) return JSON.parse(readFileSync(BUS_INDEX, 'utf8'));
  } catch {}
  return { sequence: 0, events: [], topicCounts: {} };
}

function getNextSequence() {
  const idx = getIndex();
  return idx.sequence + 1;
}

function updateIndex(event) {
  const idx = getIndex();
  idx.sequence = event.sequence;
  idx.events.push({ id: event.id, topic: event.topic, source: event.source, sequence: event.sequence, timestamp: event.timestamp });
  if (idx.events.length > MAX_EVENTS) {
    const removed = idx.events.splice(0, idx.events.length - MAX_EVENTS);
    for (const r of removed) {
      try { unlinkSync(join(BUS_DIR, `${r.id}.json`)); } catch {}
    }
  }
  idx.topicCounts[event.topic] = (idx.topicCounts[event.topic] || 0) + 1;
  writeFileSync(BUS_INDEX, JSON.stringify(idx, null, 2), 'utf8');
}

// ─── Read functions ────────────────────────────────────────────────────────

export function getEvents(limit = 50, topic = null) {
  const idx = getIndex();
  let events = idx.events;
  if (topic) events = events.filter(e => e.topic === topic);
  return events.slice(-limit).reverse();
}

export function getBusStats() {
  const idx = getIndex();
  const files = existsSync(BUS_DIR) ? readdirSync(BUS_DIR).filter(f => f.startsWith('evt-')).length : 0;
  return {
    totalEvents: idx.events.length,
    sequence: idx.sequence,
    filesOnDisk: files,
    topicCounts: idx.topicCounts,
    maxEvents: MAX_EVENTS,
    subscribers: [...subscribers.keys()].length,
  };
}

export function getFullEvent(id) {
  try {
    const path = join(BUS_DIR, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Event Replay ─────────────────────────────────────────────────────────

export function replay(callback, fromSequence = 0) {
  const idx = getIndex();
  const events = idx.events.filter(e => e.sequence > fromSequence).sort((a, b) => a.sequence - b.sequence);
  for (const summary of events) {
    const event = getFullEvent(summary.id);
    if (event) callback(event);
  }
  return events.length;
}

// ─── Bus-based agent status ────────────────────────────────────────────────

export function getAgentStatusFromBus() {
  const idx = getIndex();
  const agentRuns = idx.events.filter(e => e.topic === 'agent:run').length;
  const agentErrors = idx.events.filter(e => e.topic === 'agent:error').length;
  return { totalRuns: agentRuns, errors: agentErrors, successRate: agentRuns > 0 ? ((agentRuns - agentErrors) / agentRuns * 100).toFixed(1) + '%' : 'N/A' };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];
const rest = process.argv.slice(4).join(' ');

if (import.meta.url === `file://${process.argv[1]}`) {
  switch (cmd) {
    case 'listen':
    case 'watch': {
      console.log(`\n  ═══ Serial Bus Monitor ═══`);
      console.log(`  Watching all events...\n`);

      subscribe('*', (event) => {
        const ts = event.timestamp.slice(11, 19);
        const topic = event.topic.padEnd(25);
        const src = (event.source || '?').slice(0, 15).padEnd(15);
        console.log(`  ${ts} │ ${topic} │ ${src} │ ${JSON.stringify(event.data).slice(0, 60)}`);
      });

      // Also show recent history
      const recent = getEvents(5);
      if (recent.length > 0) {
        console.log(`  Recent events:\n`);
        for (const e of recent) {
          console.log(`  ${e.timestamp.slice(11, 19)} │ ${e.topic.padEnd(25)} │ ${(e.source || '?').slice(0, 15)}`);
        }
        console.log();
      }

      console.log(`  Waiting for events... (Ctrl+C to stop)\n`);
      setInterval(() => {}, 1000);
      break;
    }

    case 'history':
    case 'recent': {
      const limit = parseInt(arg) || 20;
      const topic = process.argv[4] || null;
      const events = getEvents(limit, topic);
      console.log(`\n  Serial Bus History (${events.length} events${topic ? `, topic: ${topic}` : ''}):\n`);
      for (const e of events) {
        console.log(`  ${e.timestamp.slice(11, 19)} │ ${e.topic.padEnd(25)} │ ${e.source?.slice(0, 18) || '?'}`);
      }
      console.log();
      break;
    }

    case 'publish':
    case 'emit': {
      if (!arg) { console.log('Usage: serial-bus publish <topic> [data]'); process.exit(1); }
      let data = {};
      try { if (rest) data = JSON.parse(rest); } catch { data = { message: rest }; }
      const event = publish(arg, data, 'cli');
      console.log(`  [+] Published: ${event.id} → ${event.topic}`);
      break;
    }

    case 'replay':
    case 'stream': {
      const from = parseInt(arg) || 0;
      const count = replay((e) => {
        console.log(`  ▶ ${e.timestamp.slice(11,19)} │ ${e.topic} │ ${e.source}`);
      }, from);
      console.log(`\n  Replayed ${count} events from sequence ${from}\n`);
      break;
    }

    case 'stats':
    case 'status': {
      const stats = getBusStats();
      const agentStatus = getAgentStatusFromBus();
      console.log(`\n  ╔══════════════════════════════════════╗`);
      console.log(`  ║  SERIAL BUS STATISTICS               ║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  events:    ${String(stats.totalEvents).padEnd(26)}║`);
      console.log(`  ║  sequence:  ${String(stats.sequence).padEnd(26)}║`);
      console.log(`  ║  disk:      ${String(stats.filesOnDisk).padEnd(26)}║`);
      console.log(`  ║  max:       ${String(stats.maxEvents).padEnd(26)}║`);
      console.log(`  ║  subscribers: ${String(stats.subscribers).padEnd(24)}║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  Agent success: ${agentStatus.successRate.padEnd(22)}║`);
      console.log(`  ╠══════════════════════════════════════╣`);
      console.log(`  ║  Topic distribution:                 ║`);
      for (const [topic, count] of Object.entries(stats.topicCounts || {}).sort((a, b) => b[1] - a[1])) {
        console.log(`  ║    ${topic.padEnd(20)} ${String(count).padStart(6)}           ║`);
      }
      if (Object.keys(stats.topicCounts || {}).length === 0) {
        console.log(`  ║    (no events yet)                   ║`);
      }
      console.log(`  ╚══════════════════════════════════════╝\n`);
      break;
    }

    default:
      console.log(`
  Serial Event Bus — central nervous system for terminal agents

  Topics:
    agent:{run|complete|error|decide|recall}
    cache:{warm|flush}
    knowledge:{inject|relate}
    middleware:{degrade|recover}
    session:{bootstrap|end}
    system:{health|error}

  Commands:
    listen             Watch live bus activity
    history [n]        Show recent events (default: 20)
    publish <t> [d]    Publish event to topic
    replay [seq]       Replay events from sequence number
    stats              Bus statistics + topic distribution

  Integration:
    All terminal agents publish to the bus via:
      import { publish } from './serial-bus.mjs'
    The agent-bridge reads bus stats for UI display.
    Events persist in .kilo/memory/bus/ for replay.
`);
  }
}
