import type { RecommendationGoal, SortKey, StrategyMetrics } from '../lib/strategy/compare';

interface StrategyTableProps { rows: StrategyMetrics[]; sortBy: SortKey; recommendationGoal: RecommendationGoal; recommendedName?: string; onSortChange: (value: SortKey) => void; onGoalChange: (value: RecommendationGoal) => void; }
const money = (v:number)=>v.toLocaleString('zh-CN',{maximumFractionDigits:2});

export function StrategyTable(props: StrategyTableProps) {
  return <section className="card strategy-table-card"><div className="strategy-toolbar"><h2>策略对比</h2><div className="toolbar-group"><label>排序<select value={props.sortBy} onChange={(e)=>props.onSortChange(e.target.value as SortKey)}><option value="netEV">净 EV</option><option value="breakEvenProbability">回本概率</option><option value="targetHitProbability">命中目标大奖概率</option></select></label><label>推荐偏好<select value={props.recommendationGoal} onChange={(e)=>props.onGoalChange(e.target.value as RecommendationGoal)}><option value="conservative">保守</option><option value="balanced">平衡</option><option value="aggressive">激进</option></select></label></div></div>
    <p className="recommend-tip">推荐策略：{props.recommendedName ?? '暂无可用策略'}</p>
    <table className="strategy-table"><thead><tr><th>策略</th><th>抽数 / 平均抽数</th><th>总成本或期望成本</th><th>总 EV</th><th>净 EV</th><th>回本概率</th><th>亏损概率</th><th>命中目标大奖概率</th><th>命中高价卡概率</th><th>最大亏损</th></tr></thead><tbody>
      {props.rows.map((row)=><tr key={row.id} className={row.name===props.recommendedName?'is-recommended':''}><td>{row.name}</td><td>{row.plannedDraws} / {row.expectedDraws.toFixed(2)}</td><td>{money(row.totalCost)}</td><td>{money(row.totalEV)}</td><td>{money(row.netEV)}</td><td>{(row.breakEvenProbability*100).toFixed(1)}%</td><td>{(row.lossProbability*100).toFixed(1)}%</td><td>{(row.targetHitProbability*100).toFixed(1)}%</td><td>{(row.highValueHitProbability*100).toFixed(1)}%</td><td>{money(row.maxLoss)}</td></tr>)}
    </tbody></table></section>;
}
