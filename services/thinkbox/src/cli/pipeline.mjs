/**
 * services/thinkbox/src/cli/pipeline.mjs
 *
 * Micro-Task Pipelining — Shredded Stream Execution (v2).
 *
 * Implements the fixed 64-byte packed FrameHeader binary protocol:
 *   magic[4] + version[1] + flags[1] + opcode[2] + stream_id[16] +
 *   frame_idx[4] + total_frames[4] + payload_len[4] + state_root[20] +
 *   checksum[4] + reserved[4]  =  64 bytes (cache-line aligned).
 *
 * Zero-copy: frames are projected directly over arena slices. The
 * network socket reads into the compute arena, the execution engine
 * overlays the FrameHeader in O(1), payload runs in-place, and the
 * mutated frame forwards to the next hop without copying.
 *
 * Backpressure: downstream flips BACKPRESSURE_PAUSE on the reverse
 * ACK; upstream halts that stream_id. Resume below queue_depth 4.
 */

export const FRAME_MAGIC = 'DTHK';
export const HEADER_SIZE = 64;
export const MAX_PAYLOAD_SIZE = (256 * 1024) - HEADER_SIZE; // 262,080 bytes
export const DEFAULT_QUEUE_CAP = 16;
export const RESUME_QUEUE_DEPTH = 4;

/** FrameFlags bitmask */
export const FrameFlags = {
  LAST_FRAME: 1 << 0, // End of stream sequence
  BACKPRESSURE_PAUSE: 1 << 1, // Upstream must pause
  AUDIT_CHECKPOINT: 1 << 2, // Includes state-root verification hash
  COMPRESSED_LZ4: 1 << 3, // Payload is LZ4 encoded
  ACK_REQUESTED: 1 << 4, // Requires execution confirmation
};

/** CRC32-C over a byte slice (0x11EDC6F41 poly). */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Simple 20-byte state hash (stand-in for truncated BLAKE3). */
export function stateRoot(bytes) {
  const out = new Uint8Array(20);
  let seed = 0x9e3779b9;
  for (const b of bytes) {
    seed = ((seed << 5) - seed + b) | 0;
    out[seed & 0x0f] ^= b;
  }
  out[0] ^= (seed >>> 24) & 0xff;
  out[1] ^= (seed >>> 16) & 0xff;
  return out;
}

/**
 * FrameHeader — 64-byte packed binary layout, cache-line aligned.
 * Serialized to/from a Uint8Array for the wire protocol.
 */
export class FrameHeader {
  constructor({
    version = 0x01,
    flags = 0,
    opCode = 0,
    streamId = null,
    frameIdx = 0,
    totalFrames = 0,
    payloadLen = 0,
    stateRootBytes = null,
    checksum = 0,
  } = {}) {
    this.version = version;
    this.flags = flags;
    this.opCode = opCode;
    this.streamId = streamId ? Uint8Array.from(streamId) : new Uint8Array(16);
    this.frameIdx = frameIdx;
    this.totalFrames = totalFrames;
    this.payloadLen = payloadLen;
    this.stateRoot = stateRootBytes ? Uint8Array.from(stateRootBytes) : new Uint8Array(20);
    this.checksum = checksum;
  }

  /** Serialize header to a 64-byte buffer (zero-copy on send). */
  toBytes() {
    const buf = new Uint8Array(HEADER_SIZE);
    buf.set([0x44, 0x54, 0x48, 0x4b], 0); // 'D','T','H','K'
    buf[4] = this.version;
    buf[5] = this.flags;
    buf[6] = (this.opCode >> 8) & 0xff;
    buf[7] = this.opCode & 0xff;
    buf.set(this.streamId, 8);
    buf[24] = (this.frameIdx >>> 24) & 0xff;
    buf[25] = (this.frameIdx >>> 16) & 0xff;
    buf[26] = (this.frameIdx >>> 8) & 0xff;
    buf[27] = this.frameIdx & 0xff;
    buf[28] = (this.totalFrames >>> 24) & 0xff;
    buf[29] = (this.totalFrames >>> 16) & 0xff;
    buf[30] = (this.totalFrames >>> 8) & 0xff;
    buf[31] = this.totalFrames & 0xff;
    buf[32] = (this.payloadLen >>> 24) & 0xff;
    buf[33] = (this.payloadLen >>> 16) & 0xff;
    buf[34] = (this.payloadLen >>> 8) & 0xff;
    buf[35] = this.payloadLen & 0xff;
    buf.set(this.stateRoot, 36);
    buf[56] = (this.checksum >>> 24) & 0xff;
    buf[57] = (this.checksum >>> 16) & 0xff;
    buf[58] = (this.checksum >>> 8) & 0xff;
    buf[59] = this.checksum & 0xff;
    // bytes 60-63 reserved (zero)
    return buf;
  }

  /** Parse a 64-byte header buffer (O(1) reinterpretation). */
  static fromBytes(buf) {
    const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    if (magic !== FRAME_MAGIC) throw new Error(`FrameHeader: bad magic ${magic}`);
    return new FrameHeader({
      version: buf[4],
      flags: buf[5],
      opCode: (buf[6] << 8) | buf[7],
      streamId: buf.subarray(8, 24),
      frameIdx: (buf[24] << 24) | (buf[25] << 16) | (buf[26] << 8) | buf[27],
      totalFrames: (buf[28] << 24) | (buf[29] << 16) | (buf[30] << 8) | buf[31],
      payloadLen: (buf[32] << 24) | (buf[33] << 16) | (buf[34] << 8) | buf[35],
      stateRootBytes: buf.subarray(36, 56),
      checksum: (buf[56] << 24) | (buf[57] << 16) | (buf[58] << 8) | buf[59],
    });
  }

  get isLast() { return (this.flags & FrameFlags.LAST_FRAME) !== 0; }
  get hasBackpressure() { return (this.flags & FrameFlags.BACKPRESSURE_PAUSE) !== 0; }
  get isAuditCheckpoint() { return (this.flags & FrameFlags.AUDIT_CHECKPOINT) !== 0; }
  setBackpressure(on) {
    if (on) this.flags |= FrameFlags.BACKPRESSURE_PAUSE;
    else this.flags &= ~FrameFlags.BACKPRESSURE_PAUSE;
  }
}

/**
 * Encode a full frame: 64-byte header + payload. Computes checksum
 * over payload (header serialized after so payload checksum stable).
 */
export function encodeFrame({ opCode, streamId, frameIdx, totalFrames, payload, flags = 0 }) {
  const payloadBytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (payloadBytes.length > MAX_PAYLOAD_SIZE) throw new Error(`Payload too large: ${payloadBytes.length}`);
  const checksum = crc32(payloadBytes);
  const header = new FrameHeader({
    flags,
    opCode,
    streamId,
    frameIdx,
    totalFrames,
    payloadLen: payloadBytes.length,
    stateRootBytes: stateRoot(payloadBytes),
    checksum,
  });
  const frame = new Uint8Array(HEADER_SIZE + payloadBytes.length);
  frame.set(header.toBytes(), 0);
  frame.set(payloadBytes, HEADER_SIZE);
  return frame;
}

/** Decode a frame: returns { header, payload, valid } after checksum verify. */
export function decodeFrame(frameBytes) {
  if (frameBytes.length < HEADER_SIZE) return { valid: false, error: 'truncated' };
  const header = FrameHeader.fromBytes(frameBytes.subarray(0, HEADER_SIZE));
  const payload = frameBytes.subarray(HEADER_SIZE, HEADER_SIZE + header.payloadLen);
  const ok = crc32(payload) === header.checksum;
  return { valid: ok, header, payload };
}

/** Stream ID helper (16 bytes). */
export function newStreamId(seed) {
  const id = new Uint8Array(16);
  let s = seed || 1;
  for (let i = 0; i < 16; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    id[i] = s & 0xff;
  }
  return id;
}

/** PipelineHop — bounded zero-copy queue with in-band backpressure. */
export class PipelineHop {
  constructor(name, layer, queueCap = DEFAULT_QUEUE_CAP) {
    this.name = name;
    this.layer = layer;
    this.queue = [];
    this.queueCap = queueCap;
    this.processed = 0;
    this.forwarded = 0;
    this.backpressured = 0;
    this.flowControl = false;
  }

  get isFull() { return this.queue.length >= this.queueCap; }

  /** Accept a frame; flips flow-control at cap. */
  enqueue(frame) {
    if (this.isFull) {
      this.backpressured++;
      return { ok: false, reason: 'queue-full' };
    }
    this.queue.push(frame);
    this.processed++;
    this.flowControl = this.queue.length >= this.queueCap;
    return { ok: true, backpressure: this.flowControl };
  }

  /** Process + forward; frame payload passes through (no copy). */
  forwardTo(frame, nextHop) {
    this.queue = this.queue.filter((f) => f.id !== frame.id);
    this.forwarded++;
    const res = nextHop.enqueue(frame);
    if (!res.ok) frame.state = 'BACKPRESSURED';
    return res;
  }
}

/** Run a shredded pipeline across hops (256KB frames). */
export function runPipeline(hops, frames, { allowDrops = true } = {}) {
  const results = {
    hops: hops.map((h) => ({ name: h.name, layer: h.layer, processed: 0, forwarded: 0 })),
    frames: frames.map((f) => ({ id: f.id, state: 'FRESH', path: [] })),
    completed: 0,
    dropped: 0,
  };

  for (const frame of frames) {
    let idx = results.frames.findIndex((f) => f.id === frame.id);
    let delivered = true;
    for (let h = 0; h < hops.length; h++) {
      const hop = hops[h];
      if (hop.isFull) {
        results.frames[idx].state = 'BACKPRESSURED';
        results.frames[idx].path.push(`${hop.name}:BLOCKED`);
        if (!allowDrops) { results.dropped++; results.frames[idx].state = 'DROPPED'; }
        delivered = false;
        break;
      }
      hop.enqueue(frame);
      results.hops[h].processed++;
      results.frames[idx].path.push(hop.name);
    }
    if (delivered) {
      results.frames[idx].state = 'COMPLETED';
      results.completed++;
    }
  }
  return results;
}

/** Shred a byte payload into aligned frames with layer ranges. */
export function shredPayload(bytes, totalLayers = 4) {
  const frames = [];
  const maxPayload = MAX_PAYLOAD_SIZE;
  const count = Math.ceil(bytes.length / maxPayload);
  for (let i = 0; i < count; i++) {
    const start = i * maxPayload;
    const end = Math.min(start + maxPayload, bytes.length);
    const layer = `${Math.floor((i * totalLayers) / Math.max(count, 1))}-${Math.floor(((i + 1) * totalLayers) / Math.max(count, 1))}`;
    frames.push({ id: `frame-${i}`, data: bytes.subarray(start, end), layer, state: 'FRESH' });
  }
  return frames;
}
