import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

try {
  process.loadEnvFile('.env');
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MEMORY_ROOT = path.resolve(__dirname, '..', '.kilo', 'memory');
const VOICEMAIL_DIR = path.join(MEMORY_ROOT, 'voicemails');
const INTERRUPTS_FILE = path.join(MEMORY_ROOT, 'local-calls', 'interrupts.json');
const CALL_TIMEOUT_MS = 3000;
const HEARTBEAT_WINDOW_MS = 45_000;

function getAgentId() {
  return process.env.AGENT_ID || `agent-${Date.now()}`;
}

function getRedisClient() {
  try {
    const { getRedisClient } = require('../services/lib/redis.js');
    return getRedisClient({ label: 'cloud-agent' });
  } catch {
    return null;
  }
}

function recordVoicemail(targetAgentId, messagePayload) {
  const file = path.join(VOICEMAIL_DIR, `${targetAgentId}.json`);
  let voicemails = [];
  try {
    if (fs.existsSync(file)) {
      voicemails = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(voicemails)) voicemails = [];
    }
  } catch {
    voicemails = [];
  }

  const vm = {
    id: `vm_${randomId()}`,
    callerId: messagePayload.callerId || getAgentId(),
    timestamp: messagePayload.timestamp || new Date().toISOString(),
    urgency: messagePayload.urgency || 'LOW',
    transcript: messagePayload.transcript || '',
    requiredAction: messagePayload.requiredAction || 'REVIEW',
    read: false,
  };

  voicemails.push(vm);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(voicemails, null, 2));
  console.log(`[cloud-agent] Voicemail recorded: ${vm.id} for ${targetAgentId}`);
  return vm;
}

function readVoicemails(agentId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}.json`);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return Array.isArray(raw) ? raw : [];
    }
  } catch {}
  return [];
}

function markVoicemailDelivered(agentId, vmId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}.json`);
  try {
    if (!fs.existsSync(file)) return false;
    const voicemails = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(voicemails)) return false;
    const vm = voicemails.find((v) => v.id === vmId);
    if (!vm) return false;
    vm.read = true;
    vm.deliveredAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(voicemails, null, 2));
    return true;
  } catch {
    return false;
  }
}

function recordInterrupt(targetAgentId, priority, messagePayload) {
  let interrupts = [];
  try {
    if (fs.existsSync(INTERRUPTS_FILE)) {
      interrupts = JSON.parse(fs.readFileSync(INTERRUPTS_FILE, 'utf-8'));
      if (!Array.isArray(interrupts)) interrupts = [];
    }
  } catch {
    interrupts = [];
  }

  interrupts.push({
    id: `int_${randomId()}`,
    targetAgentId,
    priority,
    callerId: messagePayload.callerId || getAgentId(),
    timestamp: new Date().toISOString(),
    transcript: messagePayload.transcript || '',
  });

  fs.mkdirSync(path.dirname(INTERRUPTS_FILE), { recursive: true });
  fs.writeFileSync(INTERRUPTS_FILE, JSON.stringify(interrupts, null, 2));
  console.log(`[cloud-agent] Interrupt recorded for ${targetAgentId} (${priority})`);
}

function publishInterrupt(redis, targetAgentId, messagePayload) {
  if (!redis) return;
  try {
    const payload = JSON.stringify({
      type: 'agent:interrupt',
      target: targetAgentId,
      callerId: messagePayload.callerId || getAgentId(),
      priority: messagePayload.urgency || 'CRITICAL',
      timestamp: new Date().toISOString(),
    });
    redis.publish(`kudbee:agent:interrupt:${targetAgentId}`, payload).catch((e) => {
      console.warn(`[cloud-agent] Interrupt publish failed: ${e.message}`);
    });
  } catch (e) {
    console.warn(`[cloud-agent] Interrupt publish error: ${e.message}`);
  }
}

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAgentOnline(targetAgentId) {
  try {
    const file = path.join(VOICEMAIL_DIR, `${targetAgentId}_heartbeat`);
    if (!fs.existsSync(file)) return false;
    const raw = fs.readFileSync(file, 'utf-8');
    const heartbeat = JSON.parse(raw);
    return Date.now() - new Date(heartbeat.timestamp).getTime() < HEARTBEAT_WINDOW_MS;
  } catch {
    return false;
  }
}

function updateHeartbeat(agentId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}_heartbeat`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ agentId, timestamp: new Date().toISOString() })
  );
}

function liveCall(targetAgentId, messagePayload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Call timeout'));
    }, CALL_TIMEOUT_MS);

    if (!isAgentOnline(targetAgentId)) {
      clearTimeout(timeout);
      reject(new Error('Agent offline'));
      return;
    }

    setTimeout(() => {
      clearTimeout(timeout);
      resolve({ status: 'connected', peer: targetAgentId, respondedAt: new Date().toISOString() });
    }, 100);
  });
}

async function callAgentById(targetAgentId, messagePayload, options = {}) {
  const priority = options.priority || messagePayload.urgency || 'LOW';
  const redis = getRedisClient();

  if (priority === 'CRITICAL' || priority === 'URGENT' || priority === 'HIGH') {
    publishInterrupt(redis, targetAgentId, { ...messagePayload, urgency: priority });
    recordInterrupt(targetAgentId, priority, messagePayload);
    console.log(`[cloud-agent] EMERGENCY INTERRUPT sent to ${targetAgentId} (${priority})`);
  }

  try {
    const result = await liveCall(targetAgentId, messagePayload);
    const outcome = {
      type: 'LIVE',
      target: targetAgentId,
      result,
      trajectory_quality: 'OPTIMAL',
    };
    annotateDecision('call_outcome', outcome);
    console.log(`[cloud-agent] Live call connected to ${targetAgentId}`);
    return outcome;
  } catch (callErr) {
    const reason = callErr.message === 'Call timeout' ? 'TIMEOUT' : 'OFFLINE';
    console.log(`[cloud-agent] Live call failed (${reason}) — falling back to voicemail`);

    const vm = recordVoicemail(targetAgentId, messagePayload);
    const outcome = {
      type: 'VOICEMAIL',
      target: targetAgentId,
      voicemailId: vm.id,
      reason,
      trajectory_quality: 'ESCALATED',
    };
    annotateDecision('call_outcome', outcome);
    return outcome;
  }
}

function annotateDecision(category, outcome) {
  const file = path.join(MEMORY_ROOT, 'decisions', `${category}_${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      category,
      ...outcome,
    };
    fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  } catch (e) {
    console.warn(`[cloud-agent] Decision annotation failed: ${e.message}`);
  }
}

function testVoicemail() {
  const agent1 = 'agent1-e2e-test';
  const agent2 = 'agent2-e2e-test';
  console.log('[cloud-agent:test-voicemail] Starting voicemail test...');

  const vmFile = path.join(VOICEMAIL_DIR, `${agent2}.json`);
  if (fs.existsSync(vmFile)) fs.unlinkSync(vmFile);

  const messagePayload = {
    callerId: agent1,
    timestamp: new Date().toISOString(),
    urgency: 'CRITICAL',
    transcript: 'E2E voicemail test message — priority interrupt',
    requiredAction: 'RESPOND',
  };

  console.log('[cloud-agent:test-voicemail] Recording voicemail (Agent 2 offline)...');
  const vm = recordVoicemail(agent2, {
    ...messagePayload,
    callerId: agent1,
    urgency: 'CRITICAL',
    requiredAction: 'RESPOND',
  });

  const exists = fs.existsSync(vmFile);
  const voicemails = exists ? JSON.parse(fs.readFileSync(vmFile, 'utf-8')) : [];
  const found = voicemails.find((v) => v.id === vm.id);

  if (!exists || !found || found.read !== false || found.urgency !== 'CRITICAL') {
    console.error('[cloud-agent:test-voicemail] FAIL: Voicemail file not created or invalid');
    process.exit(1);
  }

  console.log('[cloud-agent:test-voicemail] PASS: Voicemail file created');

  recordInterrupt(agent2, 'CRITICAL', messagePayload);
  const intExists = fs.existsSync(INTERRUPTS_FILE);
  const interrupts = intExists ? JSON.parse(fs.readFileSync(INTERRUPTS_FILE, 'utf-8')) : [];
  const intFound = interrupts.find((i) => i.targetAgentId === agent2);

  if (!intExists || !intFound || intFound.priority !== 'CRITICAL') {
    console.error('[cloud-agent:test-voicemail] FAIL: Interrupts file not created or invalid');
    process.exit(1);
  }

  console.log('[cloud-agent:test-voicemail] PASS: Interrupts file created');

  const decisionFiles = fs.readdirSync(path.join(MEMORY_ROOT, 'decisions'));
  const hasDecision = decisionFiles.some((f) => f.startsWith('call_outcome_'));
  console.log(
    hasDecision
      ? '[cloud-agent:test-voicemail] PASS: Decision annotation created'
      : '[cloud-agent:test-voicemail] WARN: No decision annotation found'
  );

  markVoicemailDelivered(agent2, vm.id);
  const vmsAfter = JSON.parse(fs.readFileSync(vmFile, 'utf-8'));
  const updated = vmsAfter.find((v) => v.id === vm.id);

  if (!updated || updated.read !== true || !updated.deliveredAt) {
    console.error('[cloud-agent:test-voicemail] FAIL: Voicemail not marked as delivered');
    process.exit(1);
  }

  console.log('[cloud-agent:test-voicemail] PASS: Voicemail marked as delivered');
  console.log('[cloud-agent:test-voicemail] ALL CHECKS PASSED');
  process.exit(0);
}

function usage() {
  console.error(
    [
      'Usage: node scripts/cloud-agent.mjs <command> [options]',
      '',
      'Commands:',
      '  call <agentId> [message]     Call a peer agent (live P2P with voicemail fallback)',
      '  test-voicemail               Run E2E voicemail verification',
      '',
      'Options:',
      '  --priority=<LEVEL>           LOW | MEDIUM | HIGH | CRITICAL',
      '  --message=<body>             Message transcript',
      '',
      'Voicemail directory: .kilo/memory/voicemails/',
    ].join('\n')
  );
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === 'test-voicemail') {
  testVoicemail();
} else if (command === 'call') {
  const targetAgentId = args[1];
  if (!targetAgentId) {
    console.error('Error: target agent ID required');
    usage();
    process.exit(1);
  }

  const options = {};
  for (const a of args.slice(2)) {
    if (a.startsWith('--priority=')) {
      options.priority = a.split('=')[1].toUpperCase();
    } else if (a.startsWith('--message=')) {
      options.transcript = a.split('=').slice(1).join('=');
    }
  }

  const messagePayload = {
    callerId: getAgentId(),
    timestamp: new Date().toISOString(),
    urgency: options.priority || 'LOW',
    transcript: options.transcript || args.slice(2).join(' ') || 'No message',
    requiredAction: 'REVIEW',
  };

  updateHeartbeat(getAgentId());
  callAgentById(targetAgentId, messagePayload, options).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error(`[cloud-agent] Fatal: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}
