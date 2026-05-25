import type { PoolState } from '../../types/pool';
import { clampPlannedDraws, getMaxPlayableDraws } from './rules';

export type RiskCalcMode = 'exactDP' | 'monteCarlo';

export interface RiskCalcOptions {
  plannedDraws: number;
  costPerEntry: number;
  stopAtCount: number;
  highValueThreshold?: number;
  monteCarloSamples?: number;
  dpStateLimit?: number;
}

export interface RiskQuantiles {
  p5: number;
  p50: number;
  p95: number;
}

export interface RiskCalcResult {
  mode: RiskCalcMode;
  isEstimate: boolean;
  plannedDraws: number;
  actualDraws: number;
  maxPlayableDraws: number;
  expectedProfit: number;
  variance: number;
  quantiles: RiskQuantiles;
  breakEvenProbability: number;
  lossProbability: number;
  highValueHitProbability: number;
  sampleCount?: number;
}

interface Distribution {
  profits: number[];
  probabilities: number[];
  mean: number;
  variance: number;
  highValueHitProbability: number;
}

const DEFAULT_HIGH_VALUE_THRESHOLD = 8000;
const DEFAULT_MC_SAMPLES = 30000;
const DEFAULT_DP_STATE_LIMIT = 120_000;

function resolveTotalRemaining(poolState: PoolState): number {
  if (poolState.totalRemaining > 0) {
    return poolState.totalRemaining;
  }

  return poolState.tiers.reduce((sum, tier) => sum + Math.max(0, tier.count), 0);
}

function expandCardValues(poolState: PoolState): number[] {
  const values: number[] = [];
  for (const tier of poolState.tiers) {
    const count = Math.max(0, Math.floor(tier.count));
    for (let i = 0; i < count; i += 1) {
      values.push(tier.value);
    }
  }

  return values;
}

function calcQuantile(samples: number[], q: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const weight = index - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function summarizeDistribution(distribution: Distribution): Omit<RiskCalcResult, 'mode' | 'isEstimate' | 'plannedDraws' | 'actualDraws' | 'maxPlayableDraws' | 'sampleCount'> {
  let breakEvenProbability = 0;
  let lossProbability = 0;

  for (let i = 0; i < distribution.profits.length; i += 1) {
    const profit = distribution.profits[i];
    const prob = distribution.probabilities[i];
    if (profit >= 0) {
      breakEvenProbability += prob;
    } else {
      lossProbability += prob;
    }
  }

  return {
    expectedProfit: distribution.mean,
    variance: distribution.variance,
    quantiles: {
      p5: calcQuantile(distribution.profits, 0.05),
      p50: calcQuantile(distribution.profits, 0.5),
      p95: calcQuantile(distribution.profits, 0.95),
    },
    breakEvenProbability,
    lossProbability,
    highValueHitProbability: distribution.highValueHitProbability,
  };
}

function exactDistribution(values: number[], draws: number, costPerEntry: number, highValueThreshold: number): Distribution {
  const states = new Map<string, number>();
  states.set(`${draws}|0`, 1);

  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx];
    const next = new Map<string, number>();

    for (const [key, prob] of states.entries()) {
      const [remainStr, sumStr] = key.split('|');
      const remain = Number(remainStr);
      const sum = Number(sumStr);
      const left = values.length - idx;

      if (remain === 0 || left === remain) {
        const forcedSum = left === remain ? sum + value : sum;
        const forcedRemain = left === remain ? remain - 1 : remain;
        const nextKey = `${forcedRemain}|${forcedSum}`;
        next.set(nextKey, (next.get(nextKey) ?? 0) + prob);
        continue;
      }

      const pickProb = remain / left;
      const skipProb = 1 - pickProb;

      const pickKey = `${remain - 1}|${sum + value}`;
      next.set(pickKey, (next.get(pickKey) ?? 0) + prob * pickProb);

      const skipKey = `${remain}|${sum}`;
      next.set(skipKey, (next.get(skipKey) ?? 0) + prob * skipProb);
    }

    states.clear();
    for (const [k, v] of next.entries()) {
      states.set(k, v);
    }
  }

  const profitMap = new Map<number, number>();
  for (const [key, prob] of states.entries()) {
    const [remainStr, sumStr] = key.split('|');
    if (Number(remainStr) !== 0) continue;
    const profit = Number(sumStr) - costPerEntry * draws;
    profitMap.set(profit, (profitMap.get(profit) ?? 0) + prob);
  }

  const profits = [...profitMap.keys()].sort((a, b) => a - b);
  const probabilities = profits.map((profit) => profitMap.get(profit) ?? 0);

  let mean = 0;
  for (let i = 0; i < profits.length; i += 1) {
    mean += profits[i] * probabilities[i];
  }

  let variance = 0;
  for (let i = 0; i < profits.length; i += 1) {
    const delta = profits[i] - mean;
    variance += delta * delta * probabilities[i];
  }

  let highValueMissProbability = 1;
  let nonHighValueCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] < highValueThreshold) nonHighValueCount += 1;
  }
  if (draws > nonHighValueCount) {
    highValueMissProbability = 0;
  } else if (draws > 0) {
    for (let i = 0; i < draws; i += 1) {
      highValueMissProbability *= (nonHighValueCount - i) / (values.length - i);
    }
  }

  return { profits, probabilities, mean, variance, highValueHitProbability: 1 - highValueMissProbability };
}

function monteCarloDistribution(values: number[], draws: number, costPerEntry: number, sampleCount: number, highValueThreshold: number): Distribution {
  const profits: number[] = [];
  let mean = 0;
  let m2 = 0;
  let highValueHitSamples = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let sum = 0;
    let hitHighValue = false;
    for (let d = 0; d < draws; d += 1) {
      const drawnValue = shuffled[d] ?? 0;
      sum += drawnValue;
      if (drawnValue >= highValueThreshold) {
        hitHighValue = true;
      }
    }
    if (hitHighValue) highValueHitSamples += 1;

    const profit = sum - costPerEntry * draws;
    profits.push(profit);

    const n = sample + 1;
    const delta = profit - mean;
    mean += delta / n;
    const delta2 = profit - mean;
    m2 += delta * delta2;
  }

  const variance = sampleCount > 1 ? m2 / sampleCount : 0;
  const probabilities = Array.from({ length: profits.length }, () => 1 / Math.max(1, sampleCount));

  return {
    profits,
    probabilities,
    mean,
    variance,
    highValueHitProbability: highValueHitSamples / Math.max(1, sampleCount),
  };
}

export function calcRiskMetrics(poolState: PoolState, options: RiskCalcOptions): RiskCalcResult {
  const totalRemaining = resolveTotalRemaining(poolState);
  const maxPlayableDraws = getMaxPlayableDraws(totalRemaining, options.stopAtCount);
  const actualDraws = clampPlannedDraws(options.plannedDraws, totalRemaining, options.stopAtCount);
  const highValueThreshold = options.highValueThreshold ?? DEFAULT_HIGH_VALUE_THRESHOLD;

  if (actualDraws === 0 || totalRemaining <= 0) {
    return {
      mode: 'exactDP',
      isEstimate: false,
      plannedDraws: options.plannedDraws,
      actualDraws,
      maxPlayableDraws,
      expectedProfit: 0,
      variance: 0,
      quantiles: { p5: 0, p50: 0, p95: 0 },
      breakEvenProbability: 1,
      lossProbability: 0,
      highValueHitProbability: 0,
    };
  }

  const values = expandCardValues(poolState);
  const stateLimit = options.dpStateLimit ?? DEFAULT_DP_STATE_LIMIT;
  const mode: RiskCalcMode = actualDraws * values.length <= stateLimit ? 'exactDP' : 'monteCarlo';

  if (mode === 'exactDP') {
    const dist = exactDistribution(values, actualDraws, options.costPerEntry, highValueThreshold);
    return {
      mode,
      isEstimate: false,
      plannedDraws: options.plannedDraws,
      actualDraws,
      maxPlayableDraws,
      ...summarizeDistribution(dist),
    };
  }

  const sampleCount = Math.max(1000, Math.floor(options.monteCarloSamples ?? DEFAULT_MC_SAMPLES));
  const dist = monteCarloDistribution(values, actualDraws, options.costPerEntry, sampleCount, highValueThreshold);
  return {
    mode,
    isEstimate: true,
    plannedDraws: options.plannedDraws,
    actualDraws,
    maxPlayableDraws,
    sampleCount,
    ...summarizeDistribution(dist),
  };
}
