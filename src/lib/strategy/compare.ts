import { calcNDrawEV } from '../calculators/ev';
import { calcRiskMetrics } from '../calculators/risk';
import { clampPlannedDraws, getMaxPlayableDraws, type LockRuleOptions } from '../calculators/rules';
import type { PoolState } from '../../types/pool';

export type StrategyId = 'singleDraw' | 'fixedN' | 'drawToLimit' | 'stopOnHighValue' | 'chaseTargetToLimit';
export type SortKey = 'netEV' | 'breakEvenProbability' | 'targetHitProbability';
export type RecommendationGoal = 'conservative' | 'balanced' | 'aggressive';

export interface StrategyMetrics {
  id: StrategyId; name: string; plannedDraws: number; actualDraws: number; totalCost: number; totalEV: number; netEV: number;
  breakEvenProbability: number; lossProbability: number; targetHitProbability: number; highValueHitProbability: number; expectedDraws: number; maxLoss: number; isEstimate?: boolean;
}

export interface StrategyCompareOptions {
  poolState: PoolState; costPerEntry: number; plannedN: number; targetPrize: number; highValueThreshold: number;
  lockAtCount: number; openedPacksThisRound: number; unlockRequiredPacks: number; sortBy?: SortKey; recommendationGoal?: RecommendationGoal;
}

type Bucket = { value: number; count: number };
type OutcomeAgg = { expectedProfit: number; breakEvenProbability: number; lossProbability: number; targetHitProbability: number; highValueHitProbability: number; expectedDraws: number; maxLoss: number; totalCost: number; totalEV: number; probabilityMass: number };

function formatCompactValue(value: number): string {
  if (value >= 10000 && value % 10000 === 0) return `${value / 10000}w`;
  return value.toLocaleString('zh-CN');
}

function normalizedEV(row: StrategyMetrics): number { return row.netEV / 10000; }

function calcRecommendationScore(row: StrategyMetrics, goal: RecommendationGoal): number {
  const evScore = normalizedEV(row);
  if (goal === 'conservative') return row.breakEvenProbability * 0.65 - row.lossProbability * 0.25 + evScore * 0.10;
  if (goal === 'aggressive') return row.targetHitProbability * 0.45 + row.highValueHitProbability * 0.30 + evScore * 0.25;
  return evScore * 0.40 + row.breakEvenProbability * 0.35 + row.targetHitProbability * 0.15 + row.highValueHitProbability * 0.10;
}

function buildBuckets(pool: PoolState): Bucket[] {
  const map = new Map<number, number>();
  for (const tier of pool.tiers) {
    const count = Math.max(0, Math.floor(tier.count));
    if (count <= 0) continue;
    map.set(tier.value, (map.get(tier.value) ?? 0) + count);
  }
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
}

function runStoppingDFS(pool: PoolState, cost: number, maxDraws: number, targetPrize: number, highValueThreshold: number, stopWhen: (v: number, hitTarget: boolean, drawIdx: number) => boolean) {
  const buckets = buildBuckets(pool);
  const memo = new Map<string, OutcomeAgg>();

  const dfs = (counts: number[], drawIdx: number, reward: number, hitTarget: boolean, hitHigh: boolean): OutcomeAgg => {
    const key = `${counts.join(',')}|${drawIdx}|${reward}|${hitTarget ? 1 : 0}|${hitHigh ? 1 : 0}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const remaining = counts.reduce((sum, c) => sum + c, 0);
    if (drawIdx >= maxDraws || remaining <= 0) {
      const profit = reward - drawIdx * cost;
      const agg: OutcomeAgg = {
        expectedProfit: profit, breakEvenProbability: profit >= 0 ? 1 : 0, lossProbability: profit < 0 ? 1 : 0,
        targetHitProbability: hitTarget ? 1 : 0, highValueHitProbability: hitHigh ? 1 : 0, expectedDraws: drawIdx,
        maxLoss: profit, totalCost: drawIdx * cost, totalEV: reward, probabilityMass: 1,
      };
      memo.set(key, agg);
      return agg;
    }

    const total = remaining;
    const aggregate: OutcomeAgg = { expectedProfit: 0, breakEvenProbability: 0, lossProbability: 0, targetHitProbability: 0, highValueHitProbability: 0, expectedDraws: 0, maxLoss: Number.POSITIVE_INFINITY, totalCost: 0, totalEV: 0, probabilityMass: 0 };

    for (let i = 0; i < buckets.length; i += 1) {
      if (counts[i] <= 0) continue;
      const value = buckets[i].value;
      const probability = counts[i] / total;
      const nextCounts = [...counts];
      nextCounts[i] -= 1;
      const nextTarget = hitTarget || value === targetPrize;
      const nextHigh = hitHigh || value >= highValueThreshold;

      let child: OutcomeAgg;
      if (stopWhen(value, nextTarget, drawIdx + 1)) {
        const nextReward = reward + value;
        const profit = nextReward - (drawIdx + 1) * cost;
        child = {
          expectedProfit: profit, breakEvenProbability: profit >= 0 ? 1 : 0, lossProbability: profit < 0 ? 1 : 0,
          targetHitProbability: nextTarget ? 1 : 0, highValueHitProbability: nextHigh ? 1 : 0, expectedDraws: drawIdx + 1,
          maxLoss: profit, totalCost: (drawIdx + 1) * cost, totalEV: nextReward, probabilityMass: 1,
        };
      } else {
        child = dfs(nextCounts, drawIdx + 1, reward + value, nextTarget, nextHigh);
      }

      aggregate.expectedProfit += child.expectedProfit * probability;
      aggregate.breakEvenProbability += child.breakEvenProbability * probability;
      aggregate.lossProbability += child.lossProbability * probability;
      aggregate.targetHitProbability += child.targetHitProbability * probability;
      aggregate.highValueHitProbability += child.highValueHitProbability * probability;
      aggregate.expectedDraws += child.expectedDraws * probability;
      aggregate.totalCost += child.totalCost * probability;
      aggregate.totalEV += child.totalEV * probability;
      aggregate.probabilityMass += child.probabilityMass * probability;
      aggregate.maxLoss = Math.min(aggregate.maxLoss, child.maxLoss);
    }

    if (!Number.isFinite(aggregate.maxLoss)) aggregate.maxLoss = 0;
    memo.set(key, aggregate);
    return aggregate;
  };

  const result = dfs(buckets.map((b) => b.count), 0, 0, false, false);
  return { ...result, actualDraws: result.expectedDraws };
}

export function compareStrategies(options: StrategyCompareOptions): { rows: StrategyMetrics[]; recommended: StrategyMetrics | null } {
  const lockRule: LockRuleOptions = { totalCards: options.poolState.totalRemaining, lockAtCount: options.lockAtCount, openedPacksThisRound: options.openedPacksThisRound, unlockRequiredPacks: options.unlockRequiredPacks };
  const maxPlayableDraws = getMaxPlayableDraws(lockRule);
  const fixedN = clampPlannedDraws(options.plannedN, lockRule);
  const drawToLimit = maxPlayableDraws;

  const base = (id: StrategyId, name: string, plannedDraws: number, n: number): StrategyMetrics => {
    const ev = calcNDrawEV(options.poolState, options.costPerEntry, n, lockRule);
    const risk = calcRiskMetrics(options.poolState, { ...lockRule, plannedDraws: n, costPerEntry: options.costPerEntry, highValueThreshold: options.highValueThreshold, targetPrize: options.targetPrize });
    return { id, name, plannedDraws, actualDraws: ev.actualDraws, totalCost: ev.totalCost, totalEV: ev.totalExpectedValue, netEV: ev.netExpectedValue, breakEvenProbability: risk.breakEvenProbability, lossProbability: risk.lossProbability, targetHitProbability: risk.targetHitProbability, highValueHitProbability: risk.highValueHitProbability, expectedDraws: risk.expectedDraws, maxLoss: risk.maxLoss };
  };

  const stopOnHigh = runStoppingDFS(options.poolState, options.costPerEntry, fixedN, options.targetPrize, options.highValueThreshold, (v) => v >= options.highValueThreshold);
  const chase = runStoppingDFS(options.poolState, options.costPerEntry, drawToLimit, options.targetPrize, options.highValueThreshold, (_, hitTarget) => hitTarget);

  const rows: StrategyMetrics[] = [
    base('singleDraw', '只玩 1 次', 1, 1),
    base('fixedN', '最多玩 N 次', fixedN, fixedN),
    base('drawToLimit', '抽到当前可参与上限', drawToLimit, drawToLimit),
    { id: 'stopOnHighValue', name: `抽到 ${formatCompactValue(options.highValueThreshold)}+ 就停，否则最多 N 次`, plannedDraws: fixedN, actualDraws: Number(stopOnHigh.actualDraws.toFixed(3)), totalCost: stopOnHigh.totalCost, totalEV: stopOnHigh.totalEV, netEV: stopOnHigh.expectedProfit, breakEvenProbability: stopOnHigh.breakEvenProbability, lossProbability: stopOnHigh.lossProbability, targetHitProbability: stopOnHigh.targetHitProbability, highValueHitProbability: stopOnHigh.highValueHitProbability, expectedDraws: stopOnHigh.expectedDraws, maxLoss: stopOnHigh.maxLoss },
    { id: 'chaseTargetToLimit', name: `追 ${formatCompactValue(options.targetPrize)} 到可参与上限`, plannedDraws: drawToLimit, actualDraws: Number(chase.actualDraws.toFixed(3)), totalCost: chase.totalCost, totalEV: chase.totalEV, netEV: chase.expectedProfit, breakEvenProbability: chase.breakEvenProbability, lossProbability: chase.lossProbability, targetHitProbability: chase.targetHitProbability, highValueHitProbability: chase.highValueHitProbability, expectedDraws: chase.expectedDraws, maxLoss: chase.maxLoss },
  ];

  const sorted = [...rows].sort((a, b) => (b[options.sortBy ?? 'netEV'] as number) - (a[options.sortBy ?? 'netEV'] as number));
  const goal = options.recommendationGoal ?? 'balanced';
  const recommended = [...rows].sort((a, b) => calcRecommendationScore(b, goal) - calcRecommendationScore(a, goal))[0] ?? null;
  return { rows: sorted, recommended };
}
