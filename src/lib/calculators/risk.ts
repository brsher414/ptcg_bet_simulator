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

function expandValues(poolState: PoolState): number[] {
  const values: number[] = [];
  for (const tier of poolState.tiers) for (let i = 0; i < Math.max(0, tier.count); i += 1) values.push(tier.value);
  return values;
}

export function calcRiskMetrics(poolState: PoolState, options: RiskCalcOptions): RiskCalcResult {
  const lockRule: LockRuleOptions = options;
  const maxPlayableDraws = getMaxPlayableDraws(lockRule);
  const actualDraws = clampPlannedDraws(options.plannedDraws, lockRule);
  const highValueThreshold = options.highValueThreshold ?? DEFAULT_HIGH_VALUE_THRESHOLD;
  const targetPrize = options.targetPrize ?? 20000;
  const values = expandValues(poolState);
  if (actualDraws <= 0 || values.length === 0) {
    return { plannedDraws: options.plannedDraws, actualDraws: 0, maxPlayableDraws, expectedProfit: 0, breakEvenProbability: 1, lossProbability: 0, highValueHitProbability: 0, targetHitProbability: 0, expectedDraws: 0, maxLoss: 0 };
  }

  const outcomes = new Map<string, number>();
  const dfs = (arr: number[], draws: number, sum: number, p: number, hitHigh: boolean, hitTarget: boolean) => {
    if (draws >= actualDraws || arr.length === 0) {
      const profit = sum - draws * options.costPerEntry;
      const key = `${profit}|${hitHigh ? 1 : 0}|${hitTarget ? 1 : 0}|${draws}`;
      outcomes.set(key, (outcomes.get(key) ?? 0) + p);
      return;
    }
    const total = arr.length;
    const used = new Set<number>();
    for (let i = 0; i < arr.length; i += 1) {
      const v = arr[i];
      if (used.has(v)) continue;
      used.add(v);
      let cnt = 0;
      for (const x of arr) if (x === v) cnt += 1;
      const next = [...arr];
      next.splice(next.indexOf(v), 1);
      dfs(next, draws + 1, sum + v, p * (cnt / total), hitHigh || v >= highValueThreshold, hitTarget || v === targetPrize);
    }
  };
  dfs(values, 0, 0, 1, false, false);

  let expectedProfit = 0; let breakEvenProbability = 0; let lossProbability = 0; let highValueHitProbability = 0; let targetHitProbability = 0; let expectedDraws = 0; let maxLoss = 0;
  for (const [key, prob] of outcomes.entries()) {
    const [profitS, highS, targetS, drawsS] = key.split('|');
    const profit = Number(profitS);
    const draws = Number(drawsS);
    expectedProfit += profit * prob;
    expectedDraws += draws * prob;
    if (profit >= 0) breakEvenProbability += prob; else lossProbability += prob;
    if (highS === '1') highValueHitProbability += prob;
    if (targetS === '1') targetHitProbability += prob;
    maxLoss = Math.min(maxLoss, profit);
  }
  return { plannedDraws: options.plannedDraws, actualDraws, maxPlayableDraws, expectedProfit, breakEvenProbability, lossProbability, highValueHitProbability, targetHitProbability, expectedDraws, maxLoss };
}
