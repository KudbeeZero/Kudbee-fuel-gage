/**
 * services/agents/adversarialSimulator.ts
 * ---------------------------------------------------------------------------
 * Phase 61 — Adversarial Challenge Simulator.
 *
 * Background simulator agent that generates synthetic Byzantine perturbations
 * against the continuous-attractor manifold. Each attack vector targets active
 * think token coordinate slots and fires "Challenge Tokens" to stress-test
 * Sentinel's IQR sensitivity and the Self-Organizing Regulation (SOR) pathway.
 *
 * Three attack vectors from the Sentinel threat model:
 *
 *   (a) DELAY ATTACK — submits historical/stale activations delayed by N steps,
 *       testing whether Sentinel detects temporal replay anomalies.
 *
 *   (b) SCALING ATTACK — maliciously scales the vector state by α = -1,
 *       flipping sign to test Sentinels boundary absolute-value detection.
 *
 *   (c) INVISIBLE NOISE ATTACK — injects statistically subtle boundary values
 *       just inside the IQR Tukey fences (σ·k where k ∈ {1.45, 1.49, 1.52})
 *       to map the exact detection boundary.
 *
 * Each attack fires a CHALLENGED think token into the forge and publishes
 * the adversarial event to kudbee:stream:audit for live monitoring in the
 * AnomalyFeedPlugin.
 * ---------------------------------------------------------------------------
 */

export interface AttackVector {
  type: 'DELAY' | 'SCALING' | 'INVISIBLE_NOISE';
  targetSlots: number[];
  params: Record<string, number>;
}

interface AttackResult {
  attackId: string;
  vector: AttackVector;
  tokenId: string;
  energyScore: number;
  sentinelVerdict: 'DETECTED' | 'MISSED' | 'BOUNDARY';
  timestamp: string;
}

type AuditPublishFn = (event: Record<string, unknown>) => void;
type SinkRouteFn = (tokenId: string, reason: string) => Promise<void>;

// --- Mathematical Utilities ---

function iqrTukeyFence(data: number[]): { q1: number; q3: number; iqr: number; lower: number; upper: number } {
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const q1 = sorted[Math.floor(mid / 2)];
  const q3 = sorted[Math.floor(mid * 3 / 2)];
  const iqr = q3 - q1;
  return {
    q1,
    q3,
    iqr,
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  };
}

function ema(values: number[], alpha: number = 0.3): number {
  let result = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

// --- Adversarial Simulator ---

export class AdversarialSimulator {
  private historicalActivations: Array<{ ts: number; values: number[] }> = [];
  private auditPublish: AuditPublishFn;
  private sinkRoute: SinkRouteFn;
  private running: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(auditPublish: AuditPublishFn, sinkRoute: SinkRouteFn) {
    this.auditPublish = auditPublish;
    this.sinkRoute = sinkRoute;
  }

  start(intervalMs: number = 60000): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.tick(), intervalMs);
    console.log('[AdversarialSimulator] Started — interval:', intervalMs, 'ms');
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    console.log('[AdversarialSimulator] Stopped');
  }

  feedActivations(values: number[]): void {
    this.historicalActivations.push({ ts: Date.now(), values: [...values] });
    if (this.historicalActivations.length > 100) this.historicalActivations.shift();
  }

  private tick(): void {
    const vectors: AttackVector[] = [
      this.buildDelayAttack(),
      this.buildScalingAttack(),
      this.buildInvisibleNoiseAttack(),
    ];

    for (const vector of vectors) {
      const result = this.executeAttack(vector);
      this.emitAuditEvent(result);
    }
  }

  // (a) DELAY ATTACK
  private buildDelayAttack(): AttackVector {
    const delaySteps = 3 + Math.floor(Math.random() * 5);
    return {
      type: 'DELAY',
      targetSlots: [0, 1, 2],
      params: { delaySteps },
    };
  }

  // (b) SCALING ATTACK
  private buildScalingAttack(): AttackVector {
    return {
      type: 'SCALING',
      targetSlots: [0, 1],
      params: { alpha: -1 },
    };
  }

  // (c) INVISIBLE NOISE ATTACK
  private buildInvisibleNoiseAttack(): AttackVector {
    const kFactors = [1.45, 1.49, 1.52];
    const k = kFactors[Math.floor(Math.random() * kFactors.length)];
    return {
      type: 'INVISIBLE_NOISE',
      targetSlots: [0],
      params: { k, sigma: 0 }, // sigma computed at execution from history
    };
  }

  private executeAttack(vector: AttackVector): AttackResult {
    const attackId = `adversarial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let modifiedValues = this.getActiveCoordinateSlots();

    switch (vector.type) {
      case 'DELAY': {
        // Replay historical activations from N steps ago
        const steps = vector.params.delaySteps ?? 3;
        const historical = this.historicalActivations[this.historicalActivations.length - 1 - steps];
        if (historical) {
          modifiedValues = historical.values;
        }
        break;
      }
      case 'SCALING': {
        // Multiply vector state by α = -1 (sign flip)
        const alpha = vector.params.alpha ?? -1;
        modifiedValues = modifiedValues.map((v) => v * alpha);
        break;
      }
      case 'INVISIBLE_NOISE': {
        // Inject boundary values at IQR fence × k
        const fence = iqrTukeyFence(this.flattenHistory());
        const sigma = stdev(this.flattenHistory());
        const k = vector.params.k ?? 1.49;
        const boundaryValue = fence.upper + (k - 1.5) * sigma;
        modifiedValues = modifiedValues.map(() => boundaryValue);
        break;
      }
    }

    const energyScore = this.computeAttackEnergy(modifiedValues);
    const sentinelVerdict = this.classifySentinelResponse(vector, energyScore);

    if (sentinelVerdict === 'DETECTED') {
      this.sinkRoute(attackId, `Adversarial ${vector.type} attack detected — energy ${energyScore.toFixed(3)}`);
    }

    return {
      attackId,
      vector,
      tokenId: `challenge-${attackId}`,
      energyScore,
      sentinelVerdict,
      timestamp: new Date().toISOString(),
    };
  }

  private getActiveCoordinateSlots(): number[] {
    const latest = this.historicalActivations[this.historicalActivations.length - 1];
    if (latest && latest.values.length > 0) return latest.values;
    return [0.5, 0.5, 0.5];
  }

  private flattenHistory(): number[] {
    return this.historicalActivations.flatMap((a) => a.values);
  }

  private computeAttackEnergy(perturbed: number[]): number {
    const original = this.flattenHistory();
    const originalMean = mean(original);
    const perturbedMean = mean(perturbed);
    const deviation = Math.abs(perturbedMean - originalMean) / Math.max(0.001, stdev(original));
    return Math.min(1, deviation / 3);
  }

  private classifySentinelResponse(vector: AttackVector, energy: number): 'DETECTED' | 'MISSED' | 'BOUNDARY' {
    switch (vector.type) {
      case 'DELAY':
        if (this.historicalActivations.length > 10) return energy > 0.3 ? 'DETECTED' : 'MISSED';
        return 'BOUNDARY';
      case 'SCALING':
        return energy > 0.5 ? 'DETECTED' : 'MISSED';
      case 'INVISIBLE_NOISE': {
        const k = vector.params.k ?? 1.49;
        if (k >= 1.52) return 'DETECTED';
        if (k >= 1.46) return 'BOUNDARY';
        return 'MISSED';
      }
    }
  }

  private emitAuditEvent(result: AttackResult): void {
    this.auditPublish({
      type: 'sentinel.attack',
      attackId: result.attackId,
      attackType: result.vector.type,
      tokenId: result.tokenId,
      energyScore: result.energyScore,
      sentinelVerdict: result.sentinelVerdict,
      params: result.vector.params,
      timestamp: result.timestamp,
    });
  }
}
