import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_ROOT = path.resolve(__dirname, '..', '.kilo', 'memory');
const DECISIONS_DIR = path.join(MEMORY_ROOT, 'decisions');

const KEY_MAP = {
  trace_id: 'tid',
  timestamp: 'ts',
  model: 'm',
  tokens_in: 'ti',
  tokens_out: 'to',
  cost: 'c',
  provider: 'pv',
  status: 'st',
  project_name: 'pn',
  agent_id: 'aid',
  task_context: 'tc',
  correction_delta: 'cd',
  reasoning_steps: 'rs',
  confidence_score: 'cs',
  embedding_dim: 'ed',
  trajectory_quality: 'tq',
  target: 'tg',
  callerId: 'clr',
  urgency: 'urg',
  transcript: 'tr',
  requiredAction: 'ra',
  token_type: 'tt',
  efficacy: 'ef',
  kd: 'kd',
  spatial_coordinates: 'sc',
  token_hash: 'th',
};

function compactKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(compactKeys);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const mapped = KEY_MAP[key] || key;
    out[mapped] = compactKeys(value);
  }
  return out;
}

function toRelativeDelta(iso) {
  if (!iso) return null;
  try {
    const ms = Date.now() - new Date(iso).getTime();
    return ms;
  } catch {
    return null;
  }
}

function compactTimestamps(obj, parentKey) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => compactTimestamps(v, ''));
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if ((key === 'ts' || key.endsWith('_at') || key === 'timestamp') && typeof value === 'string') {
      const delta = toRelativeDelta(value);
      out[key] = delta !== null ? delta : value;
    } else if (typeof value === 'object') {
      out[key] = compactTimestamps(value, key);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function stripNoise(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripNoise);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = stripNoise(value);
      if (cleaned && Object.keys(cleaned).length > 0) {
        out[key] = cleaned;
      }
    } else {
      out[key] = stripNoise(value);
    }
  }
  return out;
}

function estimateTokenCount(obj) {
  if (obj == null) return 0;
  return JSON.stringify(obj).length;
}

function compactTrajectory(payload) {
  const before = estimateTokenCount(payload);
  let compacted = compactKeys(payload);
  compacted = compactTimestamps(compacted);
  compacted = stripNoise(compacted);
  const after = estimateTokenCount(compacted);
  return {
    compacted,
    beforeTokens: before,
    afterTokens: after,
    savingsPct: before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0,
  };
}

function annotateDPO(entry) {
  const category = entry.trajectory_quality || 'NEUTRAL';
  const file = path.join(DECISIONS_DIR, `dpo_${category.toLowerCase()}_${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const dpoEntry = {
      timestamp: new Date().toISOString(),
      recommendation: category === 'OPTIMAL' ? 'CHOSEN' : 'REJECTED',
      trajectory_quality: category,
      compactedPayload: entry.compacted ? compactTrajectory({ ...entry, payload: entry.compacted }).compacted : null,
      metadata: {
        source: entry.source || 'call_outcome',
        category,
      },
    };
    fs.writeFileSync(file, JSON.stringify(dpoEntry, null, 2));
    console.log(`[think-compact] DPO preference annotated: ${category} → ${dpoEntry.recommendation}`);
    return dpoEntry;
  } catch (e) {
    console.warn(`[think-compact] DPO annotation failed: ${e.message}`);
    return null;
  }
}

function commitToMemory(key, data) {
  const file = path.join(MEMORY_ROOT, `${key}_${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`[think-compact] Committed: ${key} (${data.afterTokens || data.afterTokens === 0 ? data.afterTokens : JSON.stringify(data).length} tokens)`);
  } catch (e) {
    console.warn(`[think-compact] Commit failed: ${e.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    let input = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => {
      try {
        const payload = JSON.parse(input);
        const result = compactTrajectory(payload);
        console.log(JSON.stringify(result));
        if (result.compacted) {
          commitToMemory('think_compacted', result);
          annotateDPO({ ...payload, trajectory_quality: payload.trajectory_quality || 'NEUTRAL', source: 'stdin', compacted: result.compacted });
        }
        process.exit(0);
      } catch {
        console.error('[think-compact] Invalid JSON input');
        process.exit(1);
      }
    });
    return;
  }

  if (args[0] === '--compact') {
    const input = args.slice(1).join(' ');
    try {
      const payload = JSON.parse(input);
      const result = compactTrajectory(payload);
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch {
      console.error('[think-compact] Invalid JSON payload');
      process.exit(1);
    }
    return;
  }

  if (args[0] === '--dpo' || args[0] === '--annotate') {
    const input = args.slice(1).join(' ');
    try {
      const entry = JSON.parse(input);
      const result = annotateDPO(entry);
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } catch {
      console.error('[think-compact] Invalid JSON for DPO annotation');
      process.exit(1);
    }
    return;
  }

  console.log(compactTrajectory({}));
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { compactTrajectory, compactKeys, stripNoise, compactTimestamps, annotateDPO, estimateTokenCount };

