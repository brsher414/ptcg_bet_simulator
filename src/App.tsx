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
  const topPlan = strategyCompare.rows.find((r) => r.id === 'fixedN') ?? strategyCompare.rows[0];

  const recommendation = useMemo(() => {
    const avg = single.expectedValue;
    let title = '继续观望';
    if (avg < costPerEntry * 0.75) title = '继续观望';
    else if (avg < costPerEntry) title = '只适合娱乐小试';
    else title = '数学上可以考虑';
    const reason = `当前单抽均值 ${fmt(avg)}，你的入池成本 ${fmt(costPerEntry)}。最多玩 ${effectivePlannedN} 次时，中 ${highValueThreshold}+ 概率 ${(topPlan.highValueHitProbability * 100).toFixed(1)}%，追 ${targetPrize} 概率 ${(topPlan.targetHitProbability * 100).toFixed(1)}%，回本概率 ${(topPlan.breakEvenProbability * 100).toFixed(1)}%，按该策略最终亏损的概率 ${(topPlan.lossProbability * 100).toFixed(1)}%。`;
    return { title, reason };
  }, [single.expectedValue, costPerEntry, effectivePlannedN, highValueThreshold, targetPrize, topPlan]);

  return <div className="app-shell"><header className="app-header"><h1>PTCG 大卡时机计算器</h1><p>帮你判断现在上车、继续等，还是放弃。</p></header><main className="app-grid">
    <section className="card"><h2>参数输入</h2>
      {[[costPerEntry, setCostPerEntry, '你的入池成本'], [plannedN, setPlannedN, '最多玩 N 次'], [lockAtCount, setLockAtCount, '剩多少包可能锁车'], [openedPacksThisRound, setOpenedPacksThisRound, '你本轮已开包数'], [unlockRequiredPacks, setUnlockRequiredPacks, '解锁需要开到第几包'], [targetPrize, setTargetPrize, '目标大奖 targetPrize'], [highValueThreshold, setHighValueThreshold, '大卡阈值 highValueThreshold']].map(([v, s, label]) => <div className='form-row' key={label as string}><label>{label as string}</label><input type='number' min={0} value={v as number} onChange={(e) => (s as (n: number) => void)(Math.max(0, Number(e.target.value) || 0))} /></div>)}
      <p className="info">现在规则下你最多还能玩 {maxPlayableDraws} 次（按你的 N，实际会按 {effectivePlannedN} 次计算）</p></section>

    <section className='card recommendation-card'><h2>🎯 当前建议：{recommendation.title}</h2><p>{recommendation.reason}</p></section>

    <section className='card'><h2>🎲 大卡命中概率</h2><p>现在最多玩 {effectivePlannedN} 次，中 {highValueThreshold}+ 的概率：{(topPlan.highValueHitProbability * 100).toFixed(1)}%</p><p>现在最多玩 {effectivePlannedN} 次，命中目标 {targetPrize} 的概率：{(topPlan.targetHitProbability * 100).toFixed(1)}%</p><p>回本概率：{(topPlan.breakEvenProbability * 100).toFixed(1)}%</p><p>单抽均值：{fmt(single.expectedValue)}</p><p>你的入池成本：{fmt(costPerEntry)}</p><p>单抽 EV：{fmt(single.singleDrawEV)}</p><p>当前最大可接受入池成本：{fmt(single.breakEvenEntryCost)}</p></section>

    <section className='card'><h2>🔒 锁车风险</h2><p>{canContinue ? `已解锁：你已满足第 ${unlockRequiredPacks} 包的解锁条件。即使奖池剩到 ${lockAtCount} 包，也可以继续追。` : `未解锁：你还没满足第 ${unlockRequiredPacks} 包的解锁条件。若奖池很快剩到 ${lockAtCount} 包，你可能会被锁车挡住。`}</p><p>当前剩余卡数：{totalCards}，锁车阈值：剩 {lockAtCount} 张。</p><p>你本轮已开包数：{openedPacksThisRound}，解锁条件：第 {unlockRequiredPacks} 包。</p><p>{openedPacksThisRound < unlockRequiredPacks ? `注意：即使你现在还没解锁，只要本轮继续开到第 ${unlockRequiredPacks} 包，就可以继续追。` : '你已经解锁，可继续根据概率决策。'}</p></section>

    <PoolEditor tiers={tiers} costPerEntry={costPerEntry} onTiersChange={setTiers} onCostChange={setCostPerEntry} />

    <section className='card'><h2>📉 继续等会不会更好</h2><p className='info'>这个模块用来判断：如果别人继续抽走低价卡，而大卡还留着，池子会不会变得更适合上车。</p><table className='strategy-table'><thead><tr><th>如果接下来被抽走</th><th>剩余数量</th><th>还要抽走几张才接近可玩</th><th>对我是否有利</th></tr></thead><tbody>{turnPositive.map((r) => <tr key={r.removeValue}><td>{r.removeValue}</td><td>{r.availableCount}</td><td>{r.neededCount ?? '-'}</td><td>{r.reason}</td></tr>)}</tbody></table></section>

    <StrategyTable rows={strategyCompare.rows} sortBy={sortBy} recommendationGoal={recommendationGoal} recommendedName={strategyCompare.recommended?.name} onSortChange={setSortBy} onGoalChange={setRecommendationGoal} />

    <section className='card footer-note'><h2>🧮 我该怎么玩</h2><p>这个工具是个人决策辅助，不保证赚钱。它根据你输入的剩余奖池、入池成本、锁车规则，计算当前命中大卡概率、回本概率和理论期望。</p><p>价格是你输入的估值，不代表真实成交价。即使概率变好，抽卡仍然有波动，建议只用可接受亏损的预算参与。</p></section>
  </main></div>;
}

export default App;
