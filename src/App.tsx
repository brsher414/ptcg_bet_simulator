import { useMemo, useState } from 'react';
import { clampPlannedDraws, getMaxPlayableDraws } from './lib/calculators/rules';
import { compareStrategies, type RecommendationGoal, type SortKey } from './lib/strategy/compare';
import { StrategyTable } from './components/StrategyTable';
import { PoolEditor } from './components/PoolEditor';
import type { PrizeTier } from './types/pool';

function App() {
  const [stopAtCount, setStopAtCount] = useState(20);
  const [plannedN, setPlannedN] = useState(30);
  const [sortBy, setSortBy] = useState<SortKey>('netEV');
  const [recommendationGoal, setRecommendationGoal] = useState<RecommendationGoal>('balanced');
  const [costPerEntry, setCostPerEntry] = useState(300);
  const [tiers, setTiers] = useState<PrizeTier[]>([
    { value: 20000, count: 1 },
    { value: 8000, count: 4 },
    { value: 3000, count: 5 },
    { value: 1000, count: 7 },
    { value: 300, count: 32 },
  ]);

  const totalCards = useMemo(() => tiers.reduce((sum, tier) => sum + tier.count, 0), [tiers]);

  const maxPlayableDraws = useMemo(
    () => getMaxPlayableDraws(totalCards, stopAtCount),
    [totalCards, stopAtCount],
  );

  const effectivePlannedN = useMemo(
    () => clampPlannedDraws(plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );

  const strategyCompare = useMemo(
    () =>
      compareStrategies({
        poolState: { totalRemaining: totalCards, tiers },
        costPerEntry,
        stopAtCount,
        plannedN,
        targetValue: 8000,
        sortBy,
        recommendationGoal,
      }),
    [totalCards, tiers, costPerEntry, stopAtCount, plannedN, sortBy, recommendationGoal],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PTCG Bet Simulator</h1>
        <p>用于计算奖池抽取策略的期望收益、概率与风险指标。</p>
      </header>

      <main className="app-grid">
        <section className="card">
          <h2>参数输入</h2>
          <div className="form-row">
            <label htmlFor="stopAtCount">下线阈值（保底剩余）</label>
            <input id="stopAtCount" type="number" min={0} value={stopAtCount} onChange={(e) => setStopAtCount(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="form-row">
            <label htmlFor="plannedN">计划抽数（N）</label>
            <input id="plannedN" type="number" min={0} value={plannedN} onChange={(e) => setPlannedN(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <p className="info">当前最多还能抽 {maxPlayableDraws} 次（规则钳制后 N={effectivePlannedN}）</p>
        </section>

        <PoolEditor tiers={tiers} costPerEntry={costPerEntry} onTiersChange={setTiers} onCostChange={setCostPerEntry} />

        <StrategyTable
          rows={strategyCompare.rows}
          sortBy={sortBy}
          recommendationGoal={recommendationGoal}
          recommendedName={strategyCompare.recommended?.name}
          onSortChange={setSortBy}
          onGoalChange={setRecommendationGoal}
        />
      </main>
    </div>
  );
}

export default App;
