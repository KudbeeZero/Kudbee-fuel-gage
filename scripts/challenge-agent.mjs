import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as readline from 'readline';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MEMORY_ROOT = path.resolve(__dirname, '..', '.kilo', 'memory');
const SENIORITY_DIR = path.join(MEMORY_ROOT, 'seniority');
const DECISIONS_DIR = path.join(MEMORY_ROOT, 'decisions');

const RANKS = [
  { name: 'ROOKIE', min: 0, badge: '○' },
  { name: 'TRIED', min: 1, badge: '◒' },
  { name: 'PROVEN', min: 3, badge: '◑' },
  { name: 'VETERAN', min: 5, badge: '◕' },
  { name: 'ELDER', min: 10, badge: '●' },
  { name: 'SAGE', min: 20, badge: '◆' },
];

function getRank(score) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (score >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

function loadSeniority(tokenId) {
  const file = path.join(SENIORITY_DIR, `${tokenId}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return { tokenId, score: 0, challenges: 0, wins: 0, losses: 0, rank: 'ROOKIE', badge: '○' };
}

function saveSeniority(entry) {
  const file = path.join(SENIORITY_DIR, `${entry.tokenId}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  } catch (e) {
    console.warn(`[challenge] Seniority save failed: ${e.message}`);
  }
}

function allSeniority() {
  const entries = [];
  try {
    if (!fs.existsSync(SENIORITY_DIR)) return entries;
    const files = fs.readdirSync(SENIORITY_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        entries.push(JSON.parse(fs.readFileSync(path.join(SENIORITY_DIR, f), 'utf-8')));
      } catch {}
    }
  } catch {}
  return entries.sort((a, b) => b.score - a.score);
}

function loadThinkTokens() {
  const tokens = [];
  try {
    if (!fs.existsSync(MEMORY_ROOT)) return tokens;
    const files = fs.readdirSync(MEMORY_ROOT).filter(
      (f) => f.endsWith('.json')
    );
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(MEMORY_ROOT, f), 'utf-8'));
        if (raw.compacted) {
          tokens.push({ file: f, data: raw.compacted });
        } else if (raw.tid || raw.trace_id || raw.correction_delta || raw.cd) {
          tokens.push({ file: f, data: raw });
        }
      } catch {}
    }
  } catch {}
  return tokens;
}

function loadDecisionAnnotations() {
  const annotations = [];
  try {
    if (!fs.existsSync(DECISIONS_DIR)) return annotations;
    const files = fs.readdirSync(DECISIONS_DIR).filter((f) => f.startsWith('dpo_') && f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(DECISIONS_DIR, f), 'utf-8'));
        annotations.push({ file: f, ...raw });
      } catch {}
    }
  } catch {}
  return annotations;
}

function evaluateChallenge(token, challengeQuery) {
  const data = token.data || token;
  const tokenText = data?.cd || data?.correction_delta || data?.correctionDelta || data?.p || data?.pn || JSON.stringify(data);
  const queryLower = challengeQuery.toLowerCase();
  const tokenLower = tokenText.toLowerCase();

  const keywords = challengeQuery.split(/\s+/).filter((w) => w.length > 2);
  let matchScore = 0;
  for (const kw of keywords) {
    if (tokenLower.includes(kw.toLowerCase())) matchScore += 1;
  }

  const relevance = keywords.length > 0 ? matchScore / keywords.length : 0;

  let score;
  let verdict;

  if (relevance >= 0.6) {
    score = Math.floor(relevance * 100);
    verdict = 'PASS';
  } else if (relevance >= 0.3) {
    score = Math.floor(relevance * 100);
    verdict = 'PARTIAL';
  } else {
    score = Math.floor(relevance * 100);
    verdict = 'FAIL';
  }

  return {
    tokenId: token.data?.tid || token.data?.id || token.file,
    challengeQuery,
    relevance,
    score,
    verdict,
    matchedKeywords: keywords.filter((kw) => tokenLower.includes(kw.toLowerCase())),
    tokenSnippet: tokenText.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
}

function applyChallengeResult(token, result) {
  const seniority = loadSeniority(result.tokenId);
  seniority.challenges += 1;
  seniority.lastChallenge = result.timestamp;

  if (result.verdict === 'PASS') {
    seniority.score += 2;
    seniority.wins += 1;
  } else if (result.verdict === 'PARTIAL') {
    seniority.score += 1;
    seniority.wins += 1;
  } else {
    seniority.score = Math.max(0, seniority.score - 1);
    seniority.losses += 1;
  }

  const rank = getRank(seniority.score);
  seniority.rank = rank.name;
  seniority.badge = rank.badge;
  seniority.rankProgress = seniority.score - rank.min;

  saveSeniority(seniority);
  return seniority;
}

function recordChallengeOutcome(result, seniority) {
  const file = path.join(DECISIONS_DIR, `dpo_challenge_${seniority.rank.toLowerCase()}_${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          timestamp: result.timestamp,
          trajectory_quality: result.verdict === 'PASS' ? 'OPTIMAL' : result.verdict === 'PARTIAL' ? 'PARTIAL' : 'ESCALATED',
          recommendation: result.verdict === 'PASS' ? 'CHOSEN' : 'REJECTED',
          tokenId: result.tokenId,
          score: result.score,
          verdict: result.verdict,
          rank: seniority.rank,
          badge: seniority.badge,
          challengeQuery: result.challengeQuery,
          tokenSnippet: result.tokenSnippet,
          metadata: { source: 'challenge-agent', category: 'challenge_outcome' },
        },
        null,
        2
      )
    );
  } catch {}
}

function getRedisClient() {
  try {
    const { getRedisClient } = require('../services/lib/redis.js');
    return getRedisClient({ label: 'challenge-agent' });
  } catch {
    return null;
  }
}

function publishChallengeEvent(redis, result) {
  if (!redis) return;
  try {
    redis
      .publish(
        'kudbee:events',
        JSON.stringify({
          event: 'think:challenge:outcome',
          payload: result,
          timestamp: new Date().toISOString(),
        })
      )
      .catch(() => {});
  } catch {}
}

async function challengeInteractive() {
  const redis = getRedisClient();
  const tokens = loadThinkTokens();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log('\n=== KUDBEE THINK TOKEN CHALLENGE TERMINAL ===');
  console.log(`Tokens in memory: ${tokens.length}`);
  console.log('Type a challenge to test the pipeline, or "leaderboard" to see rankings.\n');

  while (true) {
    const query = (await ask('>>> ')).trim();
    if (!query) continue;
    if (query === 'exit' || query === 'quit') break;
    if (query === 'leaderboard') {
      showLeaderboard();
      continue;
    }
    if (query === 'tokens') {
      listTokens(tokens);
      continue;
    }

    const target = selectBestToken(tokens, query);
    if (!target) {
      console.log('  No matching tokens found in memory. Try a different query.\n');
      continue;
    }

    const result = evaluateChallenge(target, query);
    const seniority = applyChallengeResult(target, result);
    recordChallengeOutcome(result, seniority);
    publishChallengeEvent(redis, { ...result, rank: seniority.rank, badge: seniority.badge });

    console.log(`\n  Token: ${result.tokenId}`);
    console.log(`  Verdict: ${result.verdict}  |  Score: ${result.score}%`);
    console.log(`  Matched: [${result.matchedKeywords.join(', ') || 'none'}]`);
    console.log(`  Rank: ${seniority.badge} ${seniority.rank} (${seniority.score} pts, ${seniority.challenges} challenges)\n`);
  }

  rl.close();
  console.log('\nChallenge session complete.\n');
}

function selectBestToken(tokens, query) {
  if (tokens.length === 0) return null;
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let best = null;
  let bestScore = -1;
  for (const token of tokens) {
    const text = (token.data?.cd || token.data?.correction_delta || token.data?.correctionDelta || '').toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = token;
    }
  }
  return bestScore > 0 ? best : tokens[Math.floor(Math.random() * tokens.length)];
}

function listTokens(tokens) {
  if (tokens.length === 0) {
    console.log('  No tokens in memory.\n');
    return;
  }
  console.log(`\n  ${tokens.length} token(s) in memory:`);
  for (const t of tokens.slice(0, 10)) {
    const id = t.data?.tid || t.data?.id || t.file;
    const snippet = (t.data?.cd || t.data?.correction_delta || '').slice(0, 60);
    console.log(`    ${id}: ${snippet}...`);
  }
  if (tokens.length > 10) console.log(`    ... and ${tokens.length - 10} more`);
  console.log('');
}

function showLeaderboard() {
  const entries = allSeniority();
  if (entries.length === 0) {
    console.log('\n  No tokens have been challenged yet. Challenge a token first!\n');
    return;
  }
  console.log('\n=== SENIORITY LEADERBOARD ===');
  console.log('Rank  Badge  Token                    Score  Wins/Loss  Challenges');
  console.log('─'.repeat(70));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const id = e.tokenId.slice(0, 24).padEnd(24);
    console.log(`  #${i + 1}   ${e.badge}    ${id}  ${String(e.score).padStart(4)}   ${e.wins}/${e.losses}      ${e.challenges}`);
  }
  console.log('');
}

function challengeOne(tokenId, query) {
  const tokens = loadThinkTokens();
  const target = tokens.find(
    (t) => (t.data?.tid || t.data?.id || t.file) === tokenId
  );
  if (!target) {
    console.error(`[challenge] Token not found: ${tokenId}`);
    const entries = allSeniority();
    return { error: 'token_not_found', leaderboard: entries.slice(0, 10) };
  }

  const result = evaluateChallenge(target, query);
  const seniority = applyChallengeResult(target, result);
  recordChallengeOutcome(result, seniority);

  const redis = getRedisClient();
  publishChallengeEvent(redis, { ...result, rank: seniority.rank, badge: seniority.badge });

  return {
    ...result,
    rank: seniority.rank,
    badge: seniority.badge,
    score: seniority.score,
    challenges: seniority.challenges,
    wins: seniority.wins,
    losses: seniority.losses,
    leaderboard: allSeniority().slice(0, 10),
  };
}

function getLeaderboard() {
  return allSeniority();
}

function getSeniority(tokenId) {
  return loadSeniority(tokenId);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {

const args = process.argv.slice(2);
if (args[0] === 'interactive' || args[0] === 'terminal' || !args[0]) {
  challengeInteractive().catch((err) => {
    console.error(`[challenge] Fatal: ${err.message}`);
    process.exit(1);
  });
} else if (args[0] === 'leaderboard') {
  showLeaderboard();
  process.exit(0);
} else if (args[0] === 'challenge' && args[1]) {
  const result = challengeOne(args[1], args.slice(2).join(' ') || 'validate');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} else if (args[0] === 'seniority' && args[1]) {
  console.log(JSON.stringify(getSeniority(args[1]), null, 2));
  process.exit(0);
} else {
  console.log([
    'Usage: node scripts/challenge-agent.mjs [command]',
    '  interactive         Launch interactive challenge terminal (default)',
    '  challenge <tokenId> <query>   Challenge a specific token',
    '  seniority <tokenId>           Show token rank',
    '  leaderboard                   Show rankings',
  ].join('\n'));
  process.exit(0);
}

}

export { challengeOne, getLeaderboard, getSeniority, evaluateChallenge, applyChallengeResult, RANKS, getRank };
