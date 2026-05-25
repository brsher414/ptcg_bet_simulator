import type { PoolState } from '../../types/pool';
import { clampPlannedDraws, getMaxPlayableDraws, type LockRuleOptions } from './rules';

export interface SingleDrawEVResult {
  expectedValue: number;
  singleDrawEV: number;
  breakEvenEntryCost: number;
  entryCostGap: number;
  isPositiveEV: boolean;
}

export interface NDrawEVResult {
  plannedDraws: number;
  actualDraws: number;
  maxPlayableDraws: number;
  totalExpectedValue: number;
  totalCost: number;
  netExpectedValue: number;
  isPositiveEV: boolean;
}

function resolveTotalRemaining(poolState: PoolState): number {
  if (poolState.totalRemaining > 0) return poolState.totalRemaining;
  return poolState.tiers.reduce((sum, tier) => sum + Math.max(0, tier.count), 0);
}

export function calcSingleDrawEV(poolState: PoolState, costPerEntry: number): SingleDrawEVResult {
  const totalRemaining = resolveTotalRemaining(poolState);
  if (totalRemaining <= 0) {
    return { expectedValue: 0, singleDrawEV: -costPerEntry, breakEvenEntryCost: 0, entryCostGap: -costPerEntry, isPositiveEV: false };
  }

  const totalValue = poolState.tiers.reduce((sum, tier) => sum + tier.value * Math.max(0, tier.count), 0);
  const averageValue = totalValue / totalRemaining;
  const singleDrawEV = averageValue - costPerEntry;

  return {
    expectedValue: averageValue,
    singleDrawEV,
    breakEvenEntryCost: averageValue,
    entryCostGap: averageValue - costPerEntry,
    isPositiveEV: singleDrawEV > 0,
  };
}

export function calcNDrawEV(poolState: PoolState, costPerEntry: number, N: number, lockRule: LockRuleOptions): NDrawEVResult {
  const maxPlayableDraws = getMaxPlayableDraws(lockRule);
  const actualDraws = clampPlannedDraws(N, lockRule);
  const single = calcSingleDrawEV(poolState, costPerEntry);
  const totalExpectedValue = single.expectedValue * actualDraws;
  const totalCost = costPerEntry * actualDraws;
  const netExpectedValue = totalExpectedValue - totalCost;

  return {
    plannedDraws: Math.max(0, Math.floor(N)),
    actualDraws,
    maxPlayableDraws,
    totalExpectedValue,
    totalCost,
    netExpectedValue,
    isPositiveEV: netExpectedValue > 0,
  };
}
