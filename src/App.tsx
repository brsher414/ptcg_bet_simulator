import { useMemo, useState } from 'react';
import { canContinueAfterLock, clampPlannedDraws, getMaxPlayableDraws } from './lib/calculators/rules';
import { compareStrategies, type RecommendationGoal, type SortKey } from './lib/strategy/compare';
import { StrategyTable } from './components/StrategyTable';
import { PoolEditor } from './components/PoolEditor';
import type { PrizeTier } from './types/pool';
import { calcSingleDrawEV } from './lib/calculators/ev';
import { calculateCardsNeededToTurnPositive } from './lib/calculators/turnPositive';

const fmt = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

function App() {
  const [plannedN, setPlannedN] = useState(3);
  const [sortBy, setSortBy] = useState<SortKey>('netEV');
  const [recommendationGoal, setRecommendationGoal] = useState<RecommendationGoal>('balanced');
  const [costPerEntry, setCostPerEntry] = useState(3000);
  const [lockAtCount, setLockAtCount] = useState(10);
  const [openedPacksThisRound, setOpenedPacksThisRound] = useState(0);
  const [unlockRequiredPacks, setUnlockRequiredPacks] = useState(15);
  const [targetPrize, setTargetPrize] = useState(20000);
  const [highValueThreshold, setHighValueThreshold] = useState(8000);
  const [tiers, setTiers] = useState<PrizeTier[]>([{ value: 20000, count: 1 }, { value: 8000, count: 4 }, { value: 3000, count: 5 }, { value: 1000, count: 7 }, { value: 300, count: 32 }]);

  const totalCards = useMemo(() => tiers.reduce((sum, tier) => sum + tier.count, 0), [tiers]);
  const lockOptions = useMemo(() => ({ totalCards, lockAtCount, openedPacksThisRound, unlockRequiredPacks }), [totalCards, lockAtCount, openedPacksThisRound, unlockRequiredPacks]);
  const maxPlayableDraws = useMemo(() => getMaxPlayableDraws(lockOptions), [lockOptions]);
  const effectivePlannedN = useMemo(() => clampPlannedDraws(plannedN, lockOptions), [plannedN, lockOptions]);
  const canContinue = useMemo(() => canContinueAfterLock(openedPacksThisRound, unlockRequiredPacks), [openedPacksThisRound, unlockRequiredPacks]);
  const single = useMemo(() => calcSingleDrawEV({ totalRemaining: totalCards, tiers }, costPerEntry), [totalCards, tiers, costPerEntry]);
  const turnPositive = useMemo(() => calculateCardsNeededToTurnPositive(tiers, costPerEntry), [tiers, costPerEntry]);

  const strategyCompare = useMemo(() => compareStrategies({ poolState: { totalRemaining: totalCards, tiers }, costPerEntry, plannedN, targetPrize, highValueThreshold, lockAtCount, openedPacksThisRound, unlockRequiredPacks, sortBy, recommendationGoal }), [totalCards, tiers, costPerEntry, plannedN, targetPrize, highValueThreshold, lockAtCount, openedPacksThisRound, unlockRequiredPacks, sortBy, recommendationGoal]);

  return <div className="app-shell"><header className="app-header"><h1>PTCG Bet Simulator</h1></header><main className="app-grid">
    <section className="card"><h2>参数输入</h2>
      {[[costPerEntry,setCostPerEntry,'单次入池成本'],[plannedN,setPlannedN,'计划抽数 plannedN'],[lockAtCount,setLockAtCount,'锁车剩余张数 lockAtCount'],[openedPacksThisRound,setOpenedPacksThisRound,'本轮已开包数'],[unlockRequiredPacks,setUnlockRequiredPacks,'继续所需开包数'],[targetPrize,setTargetPrize,'目标大奖 targetPrize'],[highValueThreshold,setHighValueThreshold,'高价卡阈值 highValueThreshold']].map(([v,s,label]) => <div className='form-row' key={label as string}><label>{label as string}</label><input type='number' min={0} value={v as number} onChange={(e)=> (s as (n:number)=>void)(Math.max(0, Number(e.target.value)||0))} /></div>)}
      <p className="info">当前最多还能抽 {maxPlayableDraws} 次（规则钳制后 N={effectivePlannedN}）</p></section>

    <section className='card'><h2>锁车状态</h2><p>当前剩余卡数：{totalCards}</p><p>锁车阈值：剩 {lockAtCount} 张</p><p>本轮已开包数：{openedPacksThisRound}</p><p>继续条件：开包数 &gt; {unlockRequiredPacks}</p><p>当前是否满足继续条件：{canContinue ? '是' : '否'}</p><p>当前最大可参与抽数：{maxPlayableDraws}</p><p>{canContinue ? '你已满足继续条件，即使池子剩 10 张，也可以继续参与。' : '你还未满足继续条件，池子最多只能抽到剩 10 张。若大奖留在最后 10 张，你将无法继续追。'}</p></section>

    <section className='card'><h2>当前最大可接受入池成本</h2><p>当前最大可接受入池成本：{fmt(single.breakEvenEntryCost)}</p><p>你的入池成本：{fmt(costPerEntry)}</p><p>差距：{fmt(single.entryCostGap)}</p><p>当前单抽：{single.isPositiveEV ? '正期望' : '负期望'}</p></section>

    <PoolEditor tiers={tiers} costPerEntry={costPerEntry} onTiersChange={setTiers} onCostChange={setCostPerEntry} />

    <section className='card'><h2>还要抽走多少低价卡才转正</h2><table className='strategy-table'><thead><tr><th>被抽走档位</th><th>剩余数量</th><th>转正所需抽走数量</th><th>判断</th></tr></thead><tbody>{turnPositive.map((r)=> <tr key={r.removeValue}><td>{r.removeValue}</td><td>{r.availableCount}</td><td>{r.neededCount ?? '-'}</td><td>{r.reason}</td></tr>)}</tbody></table></section>

    <StrategyTable rows={strategyCompare.rows} sortBy={sortBy} recommendationGoal={recommendationGoal} recommendedName={strategyCompare.recommended?.name} onSortChange={setSortBy} onGoalChange={setRecommendationGoal} />
  </main></div>;
}

export default App;
