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

function calcRecommendationScore(row: StrategyMetrics, goal: RecommendationGoal): number {
  if (goal === 'conservative') return row.breakEvenProbability * 0.7 - row.lossProbability * 0.2 + row.netEV * 0.1;
  if (goal === 'aggressive') return row.targetHitProbability * 0.5 + row.highValueHitProbability * 0.25 + row.netEV * 0.25;
  return row.netEV * 0.5 + row.breakEvenProbability * 0.3 + row.targetHitProbability * 0.2;
}

function runStoppingDFS(pool: PoolState, cost: number, maxDraws: number, targetPrize: number, highValueThreshold: number, stopWhen: (v: number, hitTarget: boolean, drawIdx: number) => boolean) {
  const values: number[] = []; for (const t of pool.tiers) for (let i = 0; i < Math.max(0, t.count); i += 1) values.push(t.value);
  const outcomes: Array<{profit:number;prob:number;draws:number;hitTarget:boolean;hitHigh:boolean;reward:number}> = [];
  const dfs = (arr:number[], drawIdx:number, reward:number, p:number, hitTarget:boolean, hitHigh:boolean) => {
    if (drawIdx >= maxDraws || arr.length === 0) { outcomes.push({profit: reward - drawIdx * cost, prob: p, draws: drawIdx, hitTarget, hitHigh, reward}); return; }
    const total = arr.length; const visited = new Set<number>();
    for (let i=0;i<arr.length;i+=1){ const v=arr[i]; if(visited.has(v)) continue; visited.add(v); let cnt=0; for(const x of arr) if(x===v) cnt+=1;
      const next=[...arr]; next.splice(next.indexOf(v),1); const nextTarget=hitTarget||v===targetPrize; const nextHigh=hitHigh||v>=highValueThreshold;
      if (stopWhen(v,nextTarget,drawIdx+1)) outcomes.push({profit: reward+v-(drawIdx+1)*cost, prob:p*(cnt/total), draws:drawIdx+1, hitTarget:nextTarget, hitHigh:nextHigh, reward: reward+v});
      else dfs(next, drawIdx+1, reward+v, p*(cnt/total), nextTarget, nextHigh);
    }
  };
  dfs(values,0,0,1,false,false);
  let expectedProfit=0, breakEvenProbability=0, lossProbability=0, targetHitProbability=0, highValueHitProbability=0, expectedDraws=0, maxLoss=0, totalCost=0, totalEV=0;
  for (const o of outcomes){ expectedProfit+=o.profit*o.prob; expectedDraws+=o.draws*o.prob; totalCost += o.draws*cost*o.prob; totalEV += o.reward*o.prob; if(o.profit>=0) breakEvenProbability+=o.prob; else lossProbability+=o.prob; if(o.hitTarget) targetHitProbability+=o.prob; if(o.hitHigh) highValueHitProbability+=o.prob; maxLoss=Math.min(maxLoss,o.profit); }
  return {expectedProfit, breakEvenProbability, lossProbability, targetHitProbability, highValueHitProbability, expectedDraws, maxLoss, totalCost, totalEV, actualDraws: expectedDraws};
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
    { id: 'stopOnHighValue', name: '抽到 8000+ 就停，否则最多 N 次', plannedDraws: fixedN, actualDraws: Number(stopOnHigh.actualDraws.toFixed(3)), totalCost: stopOnHigh.totalCost, totalEV: stopOnHigh.totalEV, netEV: stopOnHigh.expectedProfit, breakEvenProbability: stopOnHigh.breakEvenProbability, lossProbability: stopOnHigh.lossProbability, targetHitProbability: stopOnHigh.targetHitProbability, highValueHitProbability: stopOnHigh.highValueHitProbability, expectedDraws: stopOnHigh.expectedDraws, maxLoss: stopOnHigh.maxLoss },
    { id: 'chaseTargetToLimit', name: '追 20000 到可参与上限', plannedDraws: drawToLimit, actualDraws: Number(chase.actualDraws.toFixed(3)), totalCost: chase.totalCost, totalEV: chase.totalEV, netEV: chase.expectedProfit, breakEvenProbability: chase.breakEvenProbability, lossProbability: chase.lossProbability, targetHitProbability: chase.targetHitProbability, highValueHitProbability: chase.highValueHitProbability, expectedDraws: chase.expectedDraws, maxLoss: chase.maxLoss },
  ];

  const sorted = [...rows].sort((a, b) => (b[options.sortBy ?? 'netEV'] as number) - (a[options.sortBy ?? 'netEV'] as number));
  const goal = options.recommendationGoal ?? 'balanced';
  const recommended = [...rows].sort((a, b) => calcRecommendationScore(b, goal) - calcRecommendationScore(a, goal))[0] ?? null;
  return { rows: sorted, recommended };
}
