import type { PoolState } from '../../types/pool';
import { clampPlannedDraws, getMaxPlayableDraws, type LockRuleOptions } from './rules';

export interface RiskCalcOptions extends LockRuleOptions {
  plannedDraws: number;
  costPerEntry: number;
  highValueThreshold?: number;
  targetPrize?: number;
}

export interface RiskCalcResult {
  plannedDraws: number;
  actualDraws: number;
  maxPlayableDraws: number;
  expectedProfit: number;
  breakEvenProbability: number;
  lossProbability: number;
  highValueHitProbability: number;
  targetHitProbability: number;
  expectedDraws: number;
  maxLoss: number;
}

const DEFAULT_HIGH_VALUE_THRESHOLD = 8000;

type DistEntry = { sum: number; draws: number; hitHigh: boolean; hitTarget: boolean; prob: number };

type ValueBucket = { value: number; count: number };

function buildBuckets(poolState: PoolState): ValueBucket[] {
  const counts = new Map<number, number>();
  for (const tier of poolState.tiers) {
    const c = Math.max(0, tier.count);
    if (c <= 0) continue;
    counts.set(tier.value, (counts.get(tier.value) ?? 0) + c);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
}

function mergeDistributions(items: DistEntry[]): DistEntry[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    const key = `${item.sum}|${item.draws}|${item.hitHigh ? 1 : 0}|${item.hitTarget ? 1 : 0}`;
    merged.set(key, (merged.get(key) ?? 0) + item.prob);
  }
  return [...merged.entries()].map(([key, prob]) => {
    const [sumS, drawsS, highS, targetS] = key.split('|');
    return { sum: Number(sumS), draws: Number(drawsS), hitHigh: highS === '1', hitTarget: targetS === '1', prob };
  });
}

export function calcRiskMetrics(poolState: PoolState, options: RiskCalcOptions): RiskCalcResult {
  const lockRule: LockRuleOptions = options;
  const maxPlayableDraws = getMaxPlayableDraws(lockRule);
  const actualDraws = clampPlannedDraws(options.plannedDraws, lockRule);
  const highValueThreshold = options.highValueThreshold ?? DEFAULT_HIGH_VALUE_THRESHOLD;
  const targetPrize = options.targetPrize ?? 20000;
  const buckets = buildBuckets(poolState);

  const totalCards = buckets.reduce((s, b) => s + b.count, 0);
  if (actualDraws <= 0 || totalCards === 0) {
    return { plannedDraws: options.plannedDraws, actualDraws: 0, maxPlayableDraws, expectedProfit: 0, breakEvenProbability: 1, lossProbability: 0, highValueHitProbability: 0, targetHitProbability: 0, expectedDraws: 0, maxLoss: 0 };
  }

  const memo = new Map<string, DistEntry[]>();

  const dfs = (counts: number[], draws: number, sum: number, hitHigh: boolean, hitTarget: boolean): DistEntry[] => {
    const remaining = counts.reduce((s, c) => s + c, 0);
    if (draws >= actualDraws || remaining === 0) return [{ sum, draws, hitHigh, hitTarget, prob: 1 }];

    const stateKey = `${counts.join(',')}|${draws}|${sum}|${hitHigh ? 1 : 0}|${hitTarget ? 1 : 0}`;
    const cached = memo.get(stateKey);
    if (cached) return cached;

    const outcomes: DistEntry[] = [];
    for (let i = 0; i < counts.length; i += 1) {
      const count = counts[i];
      if (count <= 0) continue;
      const value = buckets[i].value;
      const p = count / remaining;
      const nextCounts = [...counts];
      nextCounts[i] -= 1;
      const sub = dfs(nextCounts, draws + 1, sum + value, hitHigh || value >= highValueThreshold, hitTarget || value === targetPrize);
      for (const entry of sub) outcomes.push({ ...entry, prob: entry.prob * p });
    }

    const merged = mergeDistributions(outcomes);
    memo.set(stateKey, merged);
    return merged;
  };

  const initialCounts = buckets.map((b) => b.count);
  const outcomes = dfs(initialCounts, 0, 0, false, false);

  let expectedProfit = 0; let breakEvenProbability = 0; let lossProbability = 0; let highValueHitProbability = 0; let targetHitProbability = 0; let expectedDraws = 0; let maxLoss = 0;
  for (const o of outcomes) {
    const profit = o.sum - o.draws * options.costPerEntry;
    expectedProfit += profit * o.prob;
    expectedDraws += o.draws * o.prob;
    if (profit >= 0) breakEvenProbability += o.prob; else lossProbability += o.prob;
    if (o.hitHigh) highValueHitProbability += o.prob;
    if (o.hitTarget) targetHitProbability += o.prob;
    maxLoss = Math.min(maxLoss, profit);
  }

  return { plannedDraws: options.plannedDraws, actualDraws, maxPlayableDraws, expectedProfit, breakEvenProbability, lossProbability, highValueHitProbability, targetHitProbability, expectedDraws, maxLoss };
}
