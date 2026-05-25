import type { PoolState } from '../../types/pool';
import { clampPlannedDraws, getMaxPlayableDraws } from './rules';

export interface SingleDrawEVResult {
  expectedValue: number;
  isPositiveEV: boolean;
}

export interface SingleDrawNetEVResult extends SingleDrawEVResult {
  netExpectedValue: number;
  costPerEntry: number;
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

export interface PlayToOfflineEVResult {
  drawCount: number;
  maxPlayableDraws: number;
  totalExpectedValue: number;
  totalCost: number;
  netExpectedValue: number;
  isPositiveEV: boolean;
}

function resolveTotalRemaining(poolState: PoolState): number {
  if (poolState.totalRemaining > 0) {
    return poolState.totalRemaining;
  }

  return poolState.tiers.reduce((sum, tier) => sum + Math.max(0, tier.count), 0);
}

export function calcSingleDrawEV(poolState: PoolState): SingleDrawEVResult {
  const totalRemaining = resolveTotalRemaining(poolState);

  if (totalRemaining <= 0) {
    return {
      expectedValue: 0,
      isPositiveEV: false,
    };
  }

  const weightedSum = poolState.tiers.reduce(
    (sum, tier) => sum + tier.value * Math.max(0, tier.count),
    0,
  );
  const expectedValue = weightedSum / totalRemaining;

  return {
    expectedValue,
    isPositiveEV: expectedValue > 0,
  };
}

export function calcSingleDrawNetEV(
  poolState: PoolState,
  costPerEntry: number,
): SingleDrawNetEVResult {
  const single = calcSingleDrawEV(poolState);
  const netExpectedValue = single.expectedValue - costPerEntry;

  return {
    expectedValue: single.expectedValue,
    costPerEntry,
    netExpectedValue,
    isPositiveEV: netExpectedValue > 0,
  };
}

export function calcNDrawEV(
  poolState: PoolState,
  costPerEntry: number,
  N: number,
  stopAtCount: number,
): NDrawEVResult {
  const totalRemaining = resolveTotalRemaining(poolState);
  const maxPlayableDraws = getMaxPlayableDraws(totalRemaining, stopAtCount);
  const actualDraws = clampPlannedDraws(N, totalRemaining, stopAtCount);

  const single = calcSingleDrawEV(poolState);
  const totalExpectedValue = single.expectedValue * actualDraws;
  const totalCost = costPerEntry * actualDraws;
  const netExpectedValue = totalExpectedValue - totalCost;

  return {
    plannedDraws: N,
    actualDraws,
    maxPlayableDraws,
    totalExpectedValue,
    totalCost,
    netExpectedValue,
    isPositiveEV: netExpectedValue > 0,
  };
}

export function calcPlayToOfflineEV(
  poolState: PoolState,
  costPerEntry: number,
  stopAtCount: number,
): PlayToOfflineEVResult {
  const totalRemaining = resolveTotalRemaining(poolState);
  const maxPlayableDraws = getMaxPlayableDraws(totalRemaining, stopAtCount);

  const nDraw = calcNDrawEV(poolState, costPerEntry, maxPlayableDraws, stopAtCount);

  return {
    drawCount: maxPlayableDraws,
    maxPlayableDraws,
    totalExpectedValue: nDraw.totalExpectedValue,
    totalCost: nDraw.totalCost,
    netExpectedValue: nDraw.netExpectedValue,
    isPositiveEV: nDraw.isPositiveEV,
  };
}
