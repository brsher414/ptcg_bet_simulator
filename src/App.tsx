function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PTCG Bet Simulator</h1>
        <p>用于计算奖池抽取策略的期望收益、概率与风险指标。</p>
      </header>

      <main className="app-grid">
        <section className="card">
          <h2>参数输入</h2>
          <p>配置成本、抽数、止损条件与目标大奖面值。</p>
        </section>

        <section className="card">
          <h2>结果面板</h2>
          <p>显示期望值、命中概率、回撤风险等关键指标。</p>
        </section>

        <section className="card">
          <h2>策略对比</h2>
          <p>并列比较不同抽取策略，辅助决策。</p>
        </section>
      </main>
    </div>
  );
}

export default App;
