import { calcNDrawEV } from '../calculators/ev';
import { calcRiskMetrics } from '../calculators/risk';
import { getMaxPlayableDraws } from '../calculators/rules';
import type { PoolState } from '../../types/pool';

export type StrategyId = 'singleDraw' | 'fixedN' | 'drawToFloor' | 'chaseJackpotToN';
export type SortKey = 'netEV' | 'breakEvenProbability' | 'targetHitProbability';
export type RecommendationGoal = 'conservative' | 'balanced' | 'aggressive';

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  plannedDraws: (maxPlayableDraws: number) => number;
}

export interface StrategyMetrics {
  id: StrategyId;
  name: string;
  plannedDraws: number;
  actualDraws: number;
  totalCost: number;
  totalEV: number;
  netEV: number;
  breakEvenProbability: number;
  lossProbability: number;
  targetHitProbability: number;
}

interface ChaseOutcome {
  expectedDraws: number;
  hitProbability: number;
}

export interface StrategyCompareOptions {
  poolState: PoolState;
  costPerEntry: number;
  stopAtCount: number;
  plannedN: number;
  targetValue: number;
  sortBy?: SortKey;
  recommendationGoal?: RecommendationGoal;
}

export const strategyDefinitions: StrategyDefinition[] = [
  { id: 'singleDraw', name: '只玩 1 次', plannedDraws: (max) => (max > 0 ? 1 : 0) },
  { id: 'fixedN', name: '固定 N 次', plannedDraws: (max) => Math.min(max, max) },
  { id: 'drawToFloor', name: '抽到下线', plannedDraws: (max) => max },
  { id: 'chaseJackpotToN', name: '只追大奖到 N 次', plannedDraws: (max) => Math.min(max, max) },
];

function resolveTotalRemaining(poolState: PoolState): number {
  if (poolState.totalRemaining > 0) return poolState.totalRemaining;
  return poolState.tiers.reduce((sum, tier) => sum + Math.max(0, tier.count), 0);
}

function buildStrategyDraws(def: StrategyDefinition, maxPlayableDraws: number, plannedN: number): number {
  if (def.id === 'fixedN' || def.id === 'chaseJackpotToN') {
    return Math.min(maxPlayableDraws, Math.max(0, plannedN));
  }
  return def.plannedDraws(maxPlayableDraws);
}

function calcChaseOutcome(poolState: PoolState, plannedDraws: number, targetValue: number): ChaseOutcome {
  const tiers = poolState.tiers.map((tier) => ({ value: tier.value, count: Math.max(0, Math.floor(tier.count)) }));
  const total = tiers.reduce((sum, tier) => sum + tier.count, 0);
  if (plannedDraws <= 0 || total <= 0) return { expectedDraws: 0, hitProbability: 0 };

  const highCount = tiers.reduce((sum, tier) => sum + (tier.value >= targetValue ? tier.count : 0), 0);
  if (highCount <= 0) return { expectedDraws: plannedDraws, hitProbability: 0 };

  const cappedDraws = Math.min(plannedDraws, total);
  let missProb = 1;
  let expectedDraws = cappedDraws;
  let hitProbability = 0;

  for (let drawIdx = 1; drawIdx <= cappedDraws; drawIdx += 1) {
    const remainingBeforeDraw = total - (drawIdx - 1);
    const hitAtDrawProb = missProb * (highCount / remainingBeforeDraw);
    hitProbability += hitAtDrawProb;
    expectedDraws -= (cappedDraws - drawIdx) * hitAtDrawProb;
    missProb *= (remainingBeforeDraw - highCount) / remainingBeforeDraw;
  }

  return { expectedDraws, hitProbability };
}

function sortRows(rows: StrategyMetrics[], sortBy: SortKey): StrategyMetrics[] {
  return [...rows].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
}

function scoreForGoal(row: StrategyMetrics, goal: RecommendationGoal): number {
  if (goal === 'conservative') {
    return row.breakEvenProbability * 0.65 + row.netEV * 0.00035 + row.targetHitProbability * 0.15;
  }
  if (goal === 'aggressive') {
    return row.targetHitProbability * 0.65 + row.netEV * 0.0003 + row.breakEvenProbability * 0.15;
  }
  return row.netEV * 0.0005 + row.breakEvenProbability * 0.3 + row.targetHitProbability * 0.2;
}

export function compareStrategies(options: StrategyCompareOptions): {
  rows: StrategyMetrics[];
  recommended: StrategyMetrics | null;
} {
  const totalRemaining = resolveTotalRemaining(options.poolState);
  const maxPlayableDraws = getMaxPlayableDraws(totalRemaining, options.stopAtCount);

  const rows = strategyDefinitions.map((def) => {
    const plannedDraws = buildStrategyDraws(def, maxPlayableDraws, options.plannedN);
    const chaseOutcome = def.id === 'chaseJackpotToN'
      ? calcChaseOutcome(options.poolState, plannedDraws, options.targetValue)
      : null;
    const effectiveDraws = chaseOutcome ? chaseOutcome.expectedDraws : plannedDraws;

    const ev = calcNDrawEV(options.poolState, options.costPerEntry, effectiveDraws, options.stopAtCount);
    const risk = calcRiskMetrics(options.poolState, {
      plannedDraws: effectiveDraws,
      costPerEntry: options.costPerEntry,
      stopAtCount: options.stopAtCount,
      highValueThreshold: options.targetValue,
    });

    return {
      id: def.id,
      name: def.name,
      plannedDraws,
      actualDraws: ev.actualDraws,
      totalCost: ev.totalCost,
      totalEV: ev.totalExpectedValue,
      netEV: ev.netExpectedValue,
      breakEvenProbability: risk.breakEvenProbability,
      lossProbability: risk.lossProbability,
      targetHitProbability: chaseOutcome ? chaseOutcome.hitProbability : risk.highValueHitProbability,
    };
  });

  const sortedRows = sortRows(rows, options.sortBy ?? 'netEV');
  const goal = options.recommendationGoal ?? 'balanced';
  const recommended = rows.length
    ? [...rows].sort((a, b) => scoreForGoal(b, goal) - scoreForGoal(a, goal))[0]
    : null;

  return { rows: sortedRows, recommended };
}
