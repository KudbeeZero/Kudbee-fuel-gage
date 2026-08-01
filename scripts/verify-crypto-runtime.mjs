#!/usr/bin/env node
import crypto from 'node:crypto';

const failures = [];
const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const fail = (id, detail) => {
  failures.push(id);
  console.error(`[FAIL] ${id}: ${detail}`);
};

const major = Number(process.versions.node.split('.')[0]);
if (major >= 22) pass('node-version', `${process.version}`);
else fail('node-version', `Node 22 or newer required; found ${process.version}`);
if (process.versions.openssl) pass('openssl', `OpenSSL ${process.versions.openssl}`);
else fail('openssl', 'OpenSSL runtime version unavailable');

for (const algorithm of ['sha256', 'sha384', 'sha512']) {
  if (crypto.getHashes().includes(algorithm)) pass(`hash:${algorithm}`, 'available');
  else fail(`hash:${algorithm}`, 'unavailable');
}
for (const algorithm of ['aes-256-gcm', 'chacha20-poly1305']) {
  if (crypto.getCiphers().includes(algorithm)) pass(`cipher:${algorithm}`, 'available');
  else fail(`cipher:${algorithm}`, 'unavailable');
}

const secret = crypto.randomBytes(32);
const message = Buffer.from('kudbee-crypto-runtime-check');
const mac = crypto.createHmac('sha256', secret).update(message).digest();
const expectedMac = crypto.createHmac('sha256', secret).update(message).digest();
if (crypto.timingSafeEqual(mac, expectedMac)) pass('hmac-timing', 'HMAC and timing-safe comparison passed');
else fail('hmac-timing', 'HMAC verification failed');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const signature = crypto.sign(null, message, privateKey);
if (crypto.verify(null, message, publicKey, signature)) pass('ed25519', 'sign/verify passed');
else fail('ed25519', 'sign/verify failed');

const fips = crypto.getFips();
if (process.env.CRYPTO_FIPS_REQUIRED === '1' && fips !== 1) fail('fips', 'FIPS is required but disabled');
else pass('fips', `mode=${fips}; requirement=${process.env.CRYPTO_FIPS_REQUIRED === '1' ? 'required' : 'not-required'}`);

if (process.env.NODE_ENV === 'production') {
  for (const name of ['STREAM_SECRET', 'SESSION_SECRET']) {
    if (process.env[name]) pass(`production-secret:${name}`, 'configured (value withheld)');
    else fail(`production-secret:${name}`, 'missing (value withheld)');
  }
}

console.log(`\nCrypto runtime: ${failures.length ? 'BLOCKED' : 'READY'}; ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
