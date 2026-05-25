import { clampPlannedDraws, getMaxPlayableDraws } from './rules';

export type HitProbabilityBand = 'low' | 'medium' | 'high';
export type MathEdgeLabel = '偏正' | '偏负' | '中性';

export interface TargetCalcInput {
  targetRemaining: number;
  totalRemaining: number;
  plannedDraws: number;
  lockAtCount: number;
  openedPacksThisRound: number;
  unlockRequiredPacks: number;
  costPerEntry: number;
  targetValue: number;
  /**
   * 全奖池口径：每抽的平均奖励价值（可由外部按当前奖池估算后传入）。
   */
  averageRewardPerDraw?: number;
}

export interface TargetCalcResult {
  plannedDraws: number;
  actualDraws: number;
  maxPlayableDraws: number;
  hitProbabilityAtLeastOne: number;
  hitProbabilityBand: HitProbabilityBand;
  netExpectedValueAllRewards: number;
  netExpectedValueTargetOnly: number;
  mathEdgeLabel: MathEdgeLabel;
}

function safeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function combinationRatioNoHit(total: number, targetCount: number, draws: number): number {
  if (draws <= 0) return 1;
  if (targetCount <= 0) return 1;

  const nonTarget = total - targetCount;
  if (draws > nonTarget) {
    return 0;
  }

  // C(total-target, draws) / C(total, draws)
  // 使用连乘避免大数组合数溢出。
  let ratio = 1;
  for (let i = 0; i < draws; i += 1) {
    ratio *= (nonTarget - i) / (total - i);
  }
  return Math.min(1, Math.max(0, ratio));
}

function resolveHitProbabilityBand(probability: number): HitProbabilityBand {
  if (probability < 0.3) return 'low';
  if (probability < 0.7) return 'medium';
  return 'high';
}

function resolveMathEdgeLabel(allRewardsNet: number, targetOnlyNet: number): MathEdgeLabel {
  if (allRewardsNet > 0 || targetOnlyNet > 0) {
    return '偏正';
  }
  if (allRewardsNet < 0 && targetOnlyNet < 0) {
    return '偏负';
  }
  return '中性';
}

export function calcTargetChaseMetrics(input: TargetCalcInput): TargetCalcResult {
  const totalRemaining = safeNonNegativeInt(input.totalRemaining);
  const targetRemaining = Math.min(safeNonNegativeInt(input.targetRemaining), totalRemaining);
  const plannedDraws = safeNonNegativeInt(input.plannedDraws);
  const lockAtCount = safeNonNegativeInt(input.lockAtCount);
  const openedPacksThisRound = safeNonNegativeInt(input.openedPacksThisRound);
  const unlockRequiredPacks = safeNonNegativeInt(input.unlockRequiredPacks);
  const lockRule = { totalCards: totalRemaining, lockAtCount, openedPacksThisRound, unlockRequiredPacks };

  const maxPlayableDraws = getMaxPlayableDraws(lockRule);
  const actualDraws = clampPlannedDraws(plannedDraws, lockRule);

  const noHitProbability = combinationRatioNoHit(totalRemaining, targetRemaining, actualDraws);
  const hitProbabilityAtLeastOne = 1 - noHitProbability;

  const averageRewardPerDraw = Number.isFinite(input.averageRewardPerDraw)
    ? Math.max(0, input.averageRewardPerDraw ?? 0)
    : 0;
  const costPerEntry = Math.max(0, Number.isFinite(input.costPerEntry) ? input.costPerEntry : 0);
  const targetValue = Math.max(0, Number.isFinite(input.targetValue) ? input.targetValue : 0);

  const totalCost = actualDraws * costPerEntry;

  // 全奖池口径：所有命中奖励价值（使用平均每抽奖励做期望）减成本
  const netExpectedValueAllRewards = actualDraws * averageRewardPerDraw - totalCost;

  // 目标优先口径：仅看“至少命中一次目标”的价值期望减成本
  const netExpectedValueTargetOnly = hitProbabilityAtLeastOne * targetValue - totalCost;

  return {
    plannedDraws,
    actualDraws,
    maxPlayableDraws,
    hitProbabilityAtLeastOne,
    hitProbabilityBand: resolveHitProbabilityBand(hitProbabilityAtLeastOne),
    netExpectedValueAllRewards,
    netExpectedValueTargetOnly,
    mathEdgeLabel: resolveMathEdgeLabel(netExpectedValueAllRewards, netExpectedValueTargetOnly),
  };
}
