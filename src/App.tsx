import { useMemo, useState } from 'react';
import { clampPlannedDraws, getMaxPlayableDraws } from './lib/calculators/rules';
import { compareStrategies, type RecommendationGoal, type SortKey } from './lib/strategy/compare';
import { StrategyTable } from './components/StrategyTable';

function App() {
  const [totalCards, setTotalCards] = useState(120);
  const [stopAtCount, setStopAtCount] = useState(20);
  const [plannedN, setPlannedN] = useState(30);
  const [sortBy, setSortBy] = useState<SortKey>('netEV');
  const [recommendationGoal, setRecommendationGoal] = useState<RecommendationGoal>('balanced');

  const maxPlayableDraws = useMemo(
    () => getMaxPlayableDraws(totalCards, stopAtCount),
    [totalCards, stopAtCount],
  );

  const effectivePlannedN = useMemo(
    () => clampPlannedDraws(plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );

  const demoPoolState = useMemo(
    () => ({
      totalRemaining: totalCards,
      tiers: [
        { value: 9000, count: Math.min(1, totalCards) },
        { value: 1200, count: Math.min(4, Math.max(0, totalCards - 1)) },
        { value: 200, count: Math.max(0, totalCards - 5) },
      ],
    }),
    [totalCards],
  );

  const strategyCompare = useMemo(
    () =>
      compareStrategies({
        poolState: demoPoolState,
        costPerEntry: 300,
        stopAtCount,
        plannedN,
        targetValue: 8000,
        sortBy,
        recommendationGoal,
      }),
    [demoPoolState, stopAtCount, plannedN, sortBy, recommendationGoal],
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
            <label htmlFor="totalCards">奖池剩余卡数</label>
            <input id="totalCards" type="number" min={0} value={totalCards} onChange={(e) => setTotalCards(Math.max(0, Number(e.target.value) || 0))} />
          </div>
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
