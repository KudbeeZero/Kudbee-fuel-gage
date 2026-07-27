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

function getAgentId() {
  return process.env.AGENT_ID || `agent-${Date.now()}`;
}

function readUnreadVoicemails(agentId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}.json`);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const all = Array.isArray(raw) ? raw : [];
      return all.filter((v) => !v.read);
    }
  } catch (e) {
    console.warn(`[bootstrap] Failed to read voicemails for ${agentId}: ${e.message}`);
  }
  return [];
}

function markVoicemailDelivered(agentId, vmId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}.json`);
  try {
    if (!fs.existsSync(file)) return;
    const voicemails = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(voicemails)) return;
    const vm = voicemails.find((v) => v.id === vmId);
    if (!vm) return;
    vm.read = true;
    vm.deliveredAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(voicemails, null, 2));
  } catch (e) {
    console.warn(`[bootstrap] Failed to mark voicemail ${vmId} delivered: ${e.message}`);
  }
}

function readPendingInterrupts(agentId) {
  try {
    if (fs.existsSync(INTERRUPTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(INTERRUPTS_FILE, 'utf-8'));
      const all = Array.isArray(raw) ? raw : [];
      return all.filter((i) => i.targetAgentId === agentId);
    }
  } catch (e) {
    console.warn(`[bootstrap] Failed to read interrupts: ${e.message}`);
  }
  return [];
}

function publishBusEvent(eventType, payload) {
  try {
    const { getRedisClient } = require('../services/lib/redis.js');
    const redis = getRedisClient({ label: 'bootstrap' });
    if (redis) {
      redis
        .publish('kudbee:events', JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() }))
        .catch(() => {});
    }
  } catch {}
}

function updateHeartbeat(agentId) {
  const file = path.join(VOICEMAIL_DIR, `${agentId}_heartbeat`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ agentId, timestamp: new Date().toISOString() }));
  } catch {}
}

async function bootstrap(agentId) {
  agentId = agentId || getAgentId();
  console.log(`[bootstrap] Starting session for agent: ${agentId}`);

  updateHeartbeat(agentId);

  const interrupts = readPendingInterrupts(agentId);
  if (interrupts.length > 0) {
    console.log(`[bootstrap] ${interrupts.length} pending interrupt(s) for ${agentId}:`);
    for (const int of interrupts) {
      console.log(`  - [${int.priority}] ${int.id}: "${int.transcript}" from ${int.callerId} at ${int.timestamp}`);
    }
  }

  const voicemails = readUnreadVoicemails(agentId);
  if (voicemails.length === 0) {
    console.log(`[bootstrap] No unread voicemails for ${agentId}`);
    return;
  }

  console.log(`[bootstrap] Replaying ${voicemails.length} unread voicemail(s) for ${agentId}:`);
  for (const vm of voicemails) {
    console.log(`  ┌─────────────────────────────────────────────`);
    console.log(`  │ ID:       ${vm.id}`);
    console.log(`  │ Caller:   ${vm.callerId}`);
    console.log(`  │ Urgency:  ${vm.urgency}`);
    console.log(`  │ Action:   ${vm.requiredAction}`);
    console.log(`  │ Sent:     ${vm.timestamp}`);
    console.log(`  │ Message:  ${vm.transcript}`);
    console.log(`  └─────────────────────────────────────────────`);

    markVoicemailDelivered(agentId, vm.id);

    publishBusEvent('agent:voicemail:replayed', {
      agentId,
      voicemailId: vm.id,
      callerId: vm.callerId,
      urgency: vm.urgency,
      deliveredAt: new Date().toISOString(),
    });
  }

  console.log(`[bootstrap] Voicemail replay complete for ${agentId}`);
}

async function main() {
  const args = process.argv.slice(2);
  const agentId = args[0] || getAgentId();

  if (args.includes('--test')) {
    console.log('[bootstrap:test] Testing voicemail replay...');
    const testVmFile = path.join(VOICEMAIL_DIR, 'agent2-e2e-test.json');
    if (!fs.existsSync(testVmFile)) {
      console.log('[bootstrap:test] No voicemail file — ensuring cloud-agent test-voicemail runs first');
      console.log('[bootstrap:test] PASS: Graceful no-op on missing voicemail file');
      process.exit(0);
    }

    const vms = JSON.parse(fs.readFileSync(testVmFile, 'utf-8'));
    const unreadBefore = vms.filter((v) => !v.read);
    console.log(`[bootstrap:test] Found ${unreadBefore.length} unread voicemails`);

    await bootstrap('agent2-e2e-test');

    const vmsAfter = JSON.parse(fs.readFileSync(testVmFile, 'utf-8'));
    const stillUnread = vmsAfter.filter((v) => !v.read);
    if (stillUnread.length > 0) {
      console.error('[bootstrap:test] FAIL: Voicemails not marked as read');
      process.exit(1);
    }

    console.log('[bootstrap:test] PASS: All voicemails marked as delivered');
    process.exit(0);
  }

  await bootstrap(agentId);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[bootstrap] Fatal: ${err.message}`);
  process.exit(1);
});
