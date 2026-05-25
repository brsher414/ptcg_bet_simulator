import { useMemo, useState } from 'react';
import { calcRiskMetrics } from './lib/calculators/risk';
import {
  clampPlannedDraws,
  getMaxPlayableDraws,
  resolveDrawsByMode,
  type CalcMode,
} from './lib/calculators/rules';

function App() {
  const [totalCards, setTotalCards] = useState(120);
  const [stopAtCount, setStopAtCount] = useState(20);
  const [plannedN, setPlannedN] = useState(30);
  const [submitted, setSubmitted] = useState(false);

  const maxPlayableDraws = useMemo(
    () => getMaxPlayableDraws(totalCards, stopAtCount),
    [totalCards, stopAtCount],
  );

  const effectivePlannedN = useMemo(
    () => clampPlannedDraws(plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );

  const drawToFloorResult = useMemo(
    () => resolveDrawsByMode('drawToFloor', plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );
  const fixedDrawsResult = useMemo(
    () => resolveDrawsByMode('fixedDraws', plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );
  const chaseJackpotResult = useMemo(
    () => resolveDrawsByMode('chaseJackpot', plannedN, totalCards, stopAtCount),
    [plannedN, totalCards, stopAtCount],
  );

  const calcDisabled = maxPlayableDraws === 0;

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

  const riskResult = useMemo(
    () =>
      calcRiskMetrics(demoPoolState, {
        plannedDraws: plannedN,
        stopAtCount,
        costPerEntry: 300,
        highValueThreshold: 8000,
        monteCarloSamples: 40000,
      }),
    [demoPoolState, plannedN, stopAtCount],
  );

  const runCalculation = () => {
    if (calcDisabled) return;
    setSubmitted(true);
  };

  const modeRows: Array<{ mode: CalcMode; label: string; draws: number }> = [
    { mode: 'drawToFloor', label: '从现在抽到下线', draws: drawToFloorResult },
    { mode: 'fixedDraws', label: '只玩 N 次', draws: fixedDrawsResult },
    { mode: 'chaseJackpot', label: '追大奖', draws: chaseJackpotResult },
  ];

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
            <input
              id="totalCards"
              type="number"
              min={0}
              value={totalCards}
              onChange={(e) => setTotalCards(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="stopAtCount">下线阈值（保底剩余）</label>
            <input
              id="stopAtCount"
              type="number"
              min={0}
              value={stopAtCount}
              onChange={(e) => setStopAtCount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="plannedN">计划抽数（N）</label>
            <input
              id="plannedN"
              type="number"
              min={0}
              value={plannedN}
              onChange={(e) => setPlannedN(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <p className="info">当前最多还能抽 {maxPlayableDraws} 次</p>
          {calcDisabled && <p className="warning">池子已到下线阈值</p>}

          <button type="button" onClick={runCalculation} disabled={calcDisabled}>
            计算
          </button>
        </section>

        <section className="card">
          <h2>规则处理结果</h2>
          <p>输入 N 经过规则钳制后：{effectivePlannedN}</p>
          <ul className="result-list">
            {modeRows.map((row) => (
              <li key={row.mode}>
                <strong>{row.label}</strong>：{row.draws} 次
              </li>
            ))}
          </ul>
        </section>


        <section className="card">
          <h2>风险结果（示例池）</h2>
          <p>模式：{riskResult.mode === 'exactDP' ? '精确DP' : '蒙特卡洛'}{riskResult.isEstimate ? '（模拟估计值）' : ''}</p>
          <ul className="result-list">
            <li>实际抽数：{riskResult.actualDraws} / 上限 {riskResult.maxPlayableDraws}</li>
            <li>回本概率：{(riskResult.breakEvenProbability * 100).toFixed(2)}%</li>
            <li>亏损概率：{(riskResult.lossProbability * 100).toFixed(2)}%</li>
            <li>命中高价卡概率（≥8000）：{(riskResult.highValueHitProbability * 100).toFixed(2)}%</li>
            <li>均值：{riskResult.expectedProfit.toFixed(2)}</li>
            <li>方差：{riskResult.variance.toFixed(2)}</li>
            <li>P5 / P50 / P95：{riskResult.quantiles.p5.toFixed(2)} / {riskResult.quantiles.p50.toFixed(2)} / {riskResult.quantiles.p95.toFixed(2)}</li>
          </ul>
        </section>

        <section className="card">
          <h2>状态</h2>
          <p>{submitted ? '已完成一次计算。' : '点击“计算”查看结果快照。'}</p>
        </section>
      </main>
    </div>
  );
}

export default App;
