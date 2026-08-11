import { describe, expect, test } from 'bun:test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = async (path: string): Promise<any> => import(path);

describe('Fluid Memory Morphing Engine', () => {
  test('all 4 profiles sum to exactly 8192 KB', async () => {
    const { validateProfiles, ARENA_SIZE_KB } = await M('../src/cli/morphing.mjs');
    const results = validateProfiles();
    expect(Object.keys(results).length).toBe(4);
    for (const [name, r] of Object.entries(results) as [string, { exact: boolean }][]) {
      expect(r.exact, `${name} must equal ${ARENA_SIZE_KB} KB`).toBe(true);
    }
  });

  test('morph transition reclaims LRU into compute arena', async () => {
    const { FluidArena, MorphProfile } = await M('../src/cli/morphing.mjs');
    const arena = new FluidArena(MorphProfile.RoutingMesh);
    const before = arena.snapshot();
    expect(before.layout.cache_kb).toBe(4096);

    const after = arena.transitionProfile(MorphProfile.ComputePipeline);
    expect(after.layout.cache_kb).toBe(64);
    expect(after.layout.compute_kb).toBe(7040);
    expect(arena.transitions).toBe(1);
  });

  test('views are zero-copy subarray projections', async () => {
    const { FluidArena, MorphProfile, ARENA_SIZE_BYTES } = await M('../src/cli/morphing.mjs');
    const arena = new FluidArena(MorphProfile.ComputePipeline);
    const views = arena.projectViews();
    expect(views.net.byteLength).toBe(1024 * 1024);
    expect(views.compute.byteLength).toBe(7040 * 1024);
    expect(views.net.buffer.byteLength).toBe(ARENA_SIZE_BYTES);
  });
});

describe('CW-Kad Capability-Weighted Routing', () => {
  test('capability gate filters under-powered peers', async () => {
    const { packCapabilities, unpackCapabilities, canExecute, TaskCapability, EXECUTION_TIER, BATTERY, LATENCY } =
      await import('../src/cli/cw-kad.mjs');
    const packed = packCapabilities(EXECUTION_TIER.FP16, BATTERY.HIGH, LATENCY.LT50, 128);
    const caps = unpackCapabilities(packed);
    expect(caps.executionTier).toBe(2);
    expect(caps.battery).toBe(1);

    const task = new TaskCapability({ requiresCompute: EXECUTION_TIER.INT8, requiresPower: BATTERY.HIGH, latencyBudget: LATENCY.LT200, minThroughput: 64 });
    expect(canExecute(caps, task)).toBe(true);

    const weak = unpackCapabilities(packCapabilities(EXECUTION_TIER.RELAY_ONLY, BATTERY.LOW, LATENCY.GT200, 16));
    expect(canExecute(weak, task)).toBe(false);
  });

  test('cwRankPeers sorts eligible peers ahead of ineligible', async () => {
    const { cwRankPeers, packCapabilities, unpackCapabilities, TaskCapability, makeNodeId, EXECUTION_TIER, BATTERY, LATENCY } =
      await import('../src/cli/cw-kad.mjs');
    const target = makeNodeId(99);
    const candidates = [
      { nodeId: makeNodeId(1), caps: unpackCapabilities(packCapabilities(EXECUTION_TIER.RELAY_ONLY, BATTERY.LOW, LATENCY.GT200, 8)) },
      { nodeId: makeNodeId(2), caps: unpackCapabilities(packCapabilities(EXECUTION_TIER.FP32, BATTERY.WALL, LATENCY.LT10, 255)) },
      { nodeId: makeNodeId(3), caps: unpackCapabilities(packCapabilities(EXECUTION_TIER.INT8, BATTERY.HIGH, LATENCY.LT50, 128)) },
    ];
    const task = new TaskCapability({ requiresCompute: EXECUTION_TIER.INT8 });
    const ranked = cwRankPeers(candidates, target, task);
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[ranked.length - 1].eligible).toBe(false);
  });
});

describe('Micro-Task Pipelining (64-byte frames)', () => {
  test('frame header is exactly 64 bytes', async () => {
    const { FrameHeader, HEADER_SIZE, FRAME_MAGIC } = await import('../src/cli/pipeline.mjs');
    const h = new FrameHeader({ opCode: 0x0012, frameIdx: 3, totalFrames: 10 });
    const bytes = h.toBytes();
    expect(bytes.length).toBe(HEADER_SIZE);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe(FRAME_MAGIC);
  });

  test('encode/decode round-trips with checksum validation', async () => {
    const { encodeFrame, decodeFrame, newStreamId } = await M('../src/cli/pipeline.mjs');
    const payload = new Uint8Array(1000).fill(0x42);
    const frame = encodeFrame({ opCode: 7, streamId: newStreamId(5), frameIdx: 0, totalFrames: 1, payload });
    const { valid, header, payload: out } = decodeFrame(frame);
    expect(valid).toBe(true);
    expect(header?.opCode).toBe(7);
    expect(out?.length).toBe(1000);
  });

  test('shred + pipeline across 3 hops', async () => {
    const { PipelineHop, runPipeline, shredPayload, MAX_PAYLOAD_SIZE } = await import('../src/cli/pipeline.mjs');
    const big = new Uint8Array(MAX_PAYLOAD_SIZE * 3 + 100).fill(0x11);
    const frames = shredPayload(big, 12);
    expect(frames.length).toBe(4);

    const a = new PipelineHop('A', '0-3');
    const b = new PipelineHop('B', '4-7');
    const c = new PipelineHop('C', '8-11');
    const results = runPipeline([a, b, c], frames);
    expect(results.completed).toBe(frames.length);
    expect(results.dropped).toBe(0);
  });

  test('backpressure when queue hits cap', async () => {
    const { PipelineHop, runPipeline, shredPayload, DEFAULT_QUEUE_CAP, MAX_PAYLOAD_SIZE } = await import('../src/cli/pipeline.mjs');
    const frames = shredPayload(new Uint8Array(MAX_PAYLOAD_SIZE * 30), 4);
    const a = new PipelineHop('A', '0-1', DEFAULT_QUEUE_CAP);
    const b = new PipelineHop('B', '2-3', 2); // tiny queue forces backpressure
    const results = runPipeline([a, b], frames, { allowDrops: false });
    expect(results.dropped).toBeGreaterThan(0);
    expect(results.completed).toBeLessThan(frames.length);
  });
});

describe('Zero-Trust Execution Proofs', () => {
  test('honest executor checkpoints are internally consistent', async () => {
    const { executeWithCheckpoints, merkleRoot } = await M('../src/cli/proofs.mjs');
    const stepFn = (state: Uint8Array, i: number): Uint8Array => {
      const out = new Uint8Array(state.length);
      for (let j = 0; j < out.length; j++) out[j] = (state[j] + i) & 0xff;
      return out;
    };
    const run = executeWithCheckpoints(new Uint8Array(64).fill(1), stepFn, 20);
    expect(run.checkpoints.length).toBe(20);
    expect(run.finalDigest.length).toBe(32);
    const root = merkleRoot(run.checkpoints);
    expect(root.length).toBe(32);
  });

  test('tampered execution produces different checkpoint than honest run', async () => {
    const { executeWithCheckpoints } = await M('../src/cli/proofs.mjs');
    const stepFn = (state: Uint8Array, i: number): Uint8Array => {
      const out = new Uint8Array(state.length);
      for (let j = 0; j < out.length; j++) out[j] = (state[j] + i) & 0xff;
      return out;
    };
    const honest = executeWithCheckpoints(new Uint8Array(64).fill(1), stepFn, 20);
    const tampered = executeWithCheckpoints(new Uint8Array(64).fill(1), stepFn, 20, 7);
    // The digests diverge from step 8 onward
    let diverged = false;
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 32; j++) {
        if (honest.checkpoints[i][j] !== tampered.checkpoints[i][j]) diverged = true;
      }
    }
    expect(diverged).toBe(true);
  });
});
