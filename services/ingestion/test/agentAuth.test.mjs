import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createAgentPass,
  generateAgentIdentity,
  serializePass,
  signPayload,
} from '@kudbee/utils';

function makeTempRegistry(registry) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kudbee-agent-auth-'));
  const registryPath = path.join(tempDir, 'agents.json');
  fs.writeFileSync(registryPath, JSON.stringify({ registry }));
  return {
    tempDir,
    registryPath,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test('authenticateAgentPass accepts a valid serialized pass from the registry', async () => {
  const identity = generateAgentIdentity('agent-123');
  const temp = makeTempRegistry([
    { agentId: identity.agentId, publicKey: identity.publicKey, status: 'active' },
  ]);

  try {
    const mod = await import(`../agentAuth.js?case=auth-pass-${Date.now()}`);
    const registry = mod.loadAgentRegistry(temp.registryPath);
    const encodedPass = serializePass(createAgentPass(identity.privateKey, identity.agentId));

    assert.equal(mod.authenticateAgentPass(encodedPass, registry), identity.agentId);
  } finally {
    temp.cleanup();
  }
});

test('verifyAgentPassFromKey rejects passes for the wrong expected agent', async () => {
  const identity = generateAgentIdentity('agent-123');
  const mod = await import(`../agentAuth.js?case=expected-agent-${Date.now()}`);
  const encodedPass = serializePass(createAgentPass(identity.privateKey, identity.agentId));

  assert.equal(mod.verifyAgentPassFromKey(encodedPass, identity.publicKey, 'other-agent'), null);
});

test('verifyAgentSignature validates signatures using the registered public key', async () => {
  const identity = generateAgentIdentity('agent-123');
  const temp = makeTempRegistry([
    { agentId: identity.agentId, publicKey: identity.publicKey, status: 'active' },
  ]);

  try {
    const mod = await import(`../agentAuth.js?case=signature-${Date.now()}`);
    const registry = mod.loadAgentRegistry(temp.registryPath);
    const payload = 'trace-123';
    const signature = signPayload(identity.privateKey, payload);

    assert.equal(
      mod.verifyAgentSignature(identity.agentId, payload, signature, registry),
      identity.agentId
    );
  } finally {
    temp.cleanup();
  }
});
