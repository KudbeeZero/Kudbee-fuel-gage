#!/usr/bin/env node
/**
 * scripts/struggle-log.mjs — The Struggle Log
 * ---------------------------------------------------------------------------
 * Every struggle the system hits becomes a permanent, structured record:
 *   root cause → fix → prevention → lessons → related THINK tokens.
 *
 * The log turns friction into learning: nothing repeats, everything is
 * remembered, and future agents recall the exact fix before acting.
 *
 *   struggle-log.mjs log "<session>" "<root cause>" "<fix>" "<prevention>"
 *   struggle-log.mjs list [n]          → recent struggles
 *   struggle-log.mjs trends            → what struggles keep repeating
 *   struggle-log.mjs detail <session>  → full structured record
 *   struggle-log.mjs add-lesson <session> "<lesson>"
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LOG_FILE = join(REPO_ROOT, '.kilo', 'memory', 'struggle-log.json');
const MEMORY_DIR = join(REPO_ROOT, '.kilo', 'memory');

function loadLog() {
  if (!existsSync(LOG_FILE)) return { struggles: [], updatedAt: new Date().toISOString() };
  try {
    const raw = JSON.parse(readFileSync(LOG_FILE, 'utf8'));
    // Migrate: old single-record format → array format
    if (raw.session && !Array.isArray(raw.struggles)) {
      return { struggles: [raw], updatedAt: raw.createdAt || new Date().toISOString() };
    }
    return raw;
  } catch { return { struggles: [], updatedAt: new Date().toISOString() }; }
}

function saveLog(log) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  log.updatedAt = new Date().toISOString();
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Log a new struggle ────────────────────────────────────────────────────────

function logStruggle({ session, rootCause, fix, prevention, impact, lessons = [] }) {
  const log = loadLog();
  const existing = log.struggles.find(s => s.session === session);
  const entry = {
    session,
    timestamp: new Date().toISOString(),
    rootCause: rootCause || '',
    fix: fix || '',
    prevention: prevention || '',
    impact: impact || '',
    lessons: Array.isArray(lessons) ? lessons : [],
  };
  if (existing) {
    Object.assign(existing, entry);
    console.log(`[struggle-log] updated "${session}"`);
  } else {
    log.struggles.push(entry);
    console.log(`[struggle-log] logged "${session}"`);
  }
  saveLog(log);
  return entry;
}

function addLesson(session, lesson) {
  const log = loadLog();
  const s = log.struggles.find(x => x.session === session);
  if (!s) { console.error(`[struggle-log] no record for "${session}"`); process.exit(1); }
  if (!s.lessons) s.lessons = [];
  if (!s.lessons.includes(lesson)) s.lessons.push(lesson);
  saveLog(log);
  console.log(`[struggle-log] lesson added to "${session}"`);
}

// ── Queries ───────────────────────────────────────────────────────────────────

function listStruggles(n = 10) {
  const log = loadLog();
  return log.struggles.slice(-n).reverse();
}

function trends() {
  const log = loadLog();
  const byRootCause = {};
  for (const s of log.struggles) {
    const key = (s.rootCause || 'unknown').slice(0, 60);
    byRootCause[key] = (byRootCause[key] || 0) + 1;
  }
  return Object.entries(byRootCause).sort((a, b) => b[1] - a[1]).map(([cause, count]) => ({ cause, count }));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const [action, ...args] = process.argv.slice(2);

if (action === 'log') {
  const [session, rootCause, fix, prevention, impact] = args;
  if (!session) { console.error('Usage: struggle-log.mjs log "<session>" "<rootCause>" "<fix>" "<prevention>" ["<impact>"]'); process.exit(1); }
  logStruggle({ session, rootCause, fix, prevention, impact });
} else if (action === 'list') {
  const n = Number(args[0]) || 10;
  for (const s of listStruggles(n)) {
    console.log(`[${s.timestamp?.slice(0, 10)}] ${s.session} — ${(s.rootCause || '').slice(0, 60)}`);
  }
} else if (action === 'trends') {
  const t = trends();
  if (!t.length) { console.log('No struggles logged yet.'); process.exit(0); }
  t.forEach((x, i) => console.log(`${i + 1}. (${x.count}x) ${x.cause}`));
} else if (action === 'detail') {
  const session = args[0];
  const s = loadLog().struggles.find(x => x.session === session);
  if (!s) { console.error(`No record for "${session}"`); process.exit(1); }
  console.log(JSON.stringify(s, null, 2));
} else if (action === 'add-lesson') {
  const [session, ...lessonParts] = args;
  addLesson(session, lessonParts.join(' '));
} else if (action === 'json') {
  console.log(JSON.stringify(loadLog(), null, 2));
} else {
  console.log('Usage: struggle-log.mjs <log|list|trends|detail|add-lesson|json> [args...]');
}
