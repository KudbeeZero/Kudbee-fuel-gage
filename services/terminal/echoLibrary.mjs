/**
 * services/terminal/echoLibrary.mjs — The Echo Prompt Library
 * ---------------------------------------------------------------------------
 * INVENTION #9: Every Gemini interaction is recorded (prompt → response →
 * outcome). A scoring pass evaluates past prompts by outcome quality and
 * automatically promotes the best-performing system prompt as the default.
 *
 * The system improves its OWN intelligence over time — no human prompt
 * engineering. The more it runs, the smarter its prompts become.
 *
 *   echoLibrary.record({ kind, prompt, response, tokens, latency, outcome })
 *   echoLibrary.score()       → rank prompts by outcome quality
 *   echoLibrary.bestPrompt(kind) → return the winning system prompt
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ECHO_DIR = join(REPO_ROOT, '.kilo', 'memory', 'echo');
const ECHO_LOG = join(ECHO_DIR, 'echo-log.jsonl');
const PROMPTS_FILE = join(ECHO_DIR, 'prompts.json');

const DEFAULT_PROMPTS = {
  ask: 'You are the Kudbee Control Tower assistant. Answer the user directly, be concise, and ground everything in what is known. Do not fabricate metrics, statuses, or infrastructure claims.',
  code: 'You are the Kudbee engineering agent, trained to write production-grade code. Follow Kudbee conventions: single quotes, trailing commas, printWidth 100, LF line endings. For Node scripts use ESM (.mjs/.ts) with node: prefix for builtins. Return ONLY the code and a brief 1-2 sentence explanation. Never invent APIs — use standard libraries.',
  heal: 'You are the Kudbee self-healing engineer. Diagnose the failure below and give: (1) ROOT CAUSE: 1-2 sentences. (2) FIX: exact file path + minimal change. (3) VERIFY: the command to confirm the fix. Be precise, do not guess.',
};

// ── Persistence ──────────────────────────────────────────────────────────────

function ensureDirs() {
  if (!existsSync(ECHO_DIR)) mkdirSync(ECHO_DIR, { recursive: true });
  if (!existsSync(PROMPTS_FILE)) {
    writeFileSync(PROMPTS_FILE, JSON.stringify({ prompts: DEFAULT_PROMPTS, history: {} }, null, 2));
  }
}

function loadState() {
  ensureDirs();
  try { return JSON.parse(readFileSync(PROMPTS_FILE, 'utf8')); } catch { return { prompts: DEFAULT_PROMPTS, history: {} }; }
}

function saveState(state) {
  ensureDirs();
  writeFileSync(PROMPTS_FILE, JSON.stringify(state, null, 2));
}

// ── Record an interaction ────────────────────────────────────────────────────

export function record({ kind = 'ask', prompt = '', response = '', tokens = 0, latency = 0, outcome = 'unknown' }) {
  try {
    ensureDirs();
    const entry = {
      ts: new Date().toISOString(),
      kind, prompt: prompt.slice(0, 200), response: response.slice(0, 500),
      tokens, latency, outcome,
    };
    // Append to the echo log (append-only, like DTHINK)
    const fs = awaitImportFs();
    fs.appendFileSync(ECHO_LOG, JSON.stringify(entry) + '\n');
    // Update the prompt's rolling score
    const state = loadState();
    const hist = state.history[kind] || { count: 0, success: 0, totalLatency: 0, totalTokens: 0 };
    hist.count++;
    if (outcome === 'success') hist.success++;
    hist.totalLatency += latency;
    hist.totalTokens += tokens;
    state.history[kind] = hist;
    saveState(state);
    return { recorded: true, kind, outcome };
  } catch (e) {
    return { recorded: false, error: e.message };
  }
}

function awaitImportFs() {
  // lazy-require to avoid top-level import cost; the module is ESM
  return import('node:fs').then(fs => fs);
}

// ── Score & improve ──────────────────────────────────────────────────────────

export function score() {
  const state = loadState();
  const report = {};
  for (const [kind, hist] of Object.entries(state.history)) {
    const successRate = hist.count ? Math.round((hist.success / hist.count) * 100) : 0;
    const avgLatency = hist.count ? Math.round(hist.totalLatency / hist.count) : 0;
    const avgTokens = hist.count ? Math.round(hist.totalTokens / hist.count) : 0;
    report[kind] = {
      count: hist.count, successRate, avgLatency, avgTokens,
      grade: successRate >= 90 ? 'A' : successRate >= 70 ? 'B' : successRate >= 50 ? 'C' : 'D',
    };
  }
  return report;
}

export function bestPrompt(kind = 'ask') {
  const state = loadState();
  return state.prompts[kind] || DEFAULT_PROMPTS[kind];
}

/**
 * Improvement pass: if a kind has accumulated enough history, return a
 * suggested refined prompt (the current best + observed lesson). A human or
 * autonomous pass can accept it via echoLibrary.promote().
 */
export function suggestImprovement(kind = 'ask') {
  const state = loadState();
  const hist = state.history[kind];
  if (!hist || hist.count < 5) return { ready: false, reason: `only ${hist?.count || 0} interactions — need 5+` };
  const score = hist.success / hist.count;
  return {
    ready: true,
    current: state.prompts[kind],
    successRate: Math.round(score * 100),
    suggestion: score >= 0.9
      ? state.prompts[kind] // already great — keep
      : state.prompts[kind] + ' Be even more concise. Prefer the shortest correct answer that satisfies the request. If unsure, say so explicitly instead of guessing.',
  };
}

export function promote(kind = 'ask', newPrompt) {
  const state = loadState();
  if (newPrompt && newPrompt.length > 10) {
    state.prompts[kind] = newPrompt;
    saveState(state);
    return { promoted: true, kind };
  }
  return { promoted: false };
}

export default { record, score, bestPrompt, suggestImprovement, promote };
