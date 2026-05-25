import { Fragment, useMemo } from 'react';
import type { PrizeTier } from '../types/pool';

interface PoolEditorProps {
  tiers: PrizeTier[];
  costPerEntry: number;
  onTiersChange: (tiers: PrizeTier[]) => void;
  onCostChange: (cost: number) => void;
}

const TEMPLATE_TIERS: PrizeTier[] = [
  { value: 20000, count: 1 },
  { value: 8000, count: 4 },
  { value: 3000, count: 5 },
  { value: 1000, count: 7 },
  { value: 300, count: 32 },
];

export function PoolEditor({ tiers, costPerEntry, onTiersChange, onCostChange }: PoolEditorProps) {
  const totalCount = useMemo(() => tiers.reduce((acc, tier) => acc + (Number.isFinite(tier.count) ? tier.count : 0), 0), [tiers]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const hasInvalidCount = tiers.some((tier) => !Number.isInteger(tier.count) || tier.count < 0);
    if (hasInvalidCount) {
      errors.push('每行“剩余张数”必须是非负整数。');
    }
    if (totalCount < 1) {
      errors.push('奖池至少需要 1 张卡。');
    }
    if (!(costPerEntry > 0)) {
      errors.push('单抽成本必须是正数。');
    }
    return errors;
  }, [tiers, totalCount, costPerEntry]);

  const updateTier = (index: number, field: keyof PrizeTier, value: number) => {
    onTiersChange(
      tiers.map((tier, i) =>
        i === index
          ? {
              ...tier,
              [field]: field === 'count' ? Math.max(0, Math.floor(value || 0)) : Math.max(0, value || 0),
            }
          : tier,
      ),
    );
  };

  const addTier = () => onTiersChange([...tiers, { value: 0, count: 0 }]);
  const removeTier = (index: number) => onTiersChange(tiers.filter((_, i) => i !== index));

  const importJson = () => {
    const text = window.prompt('粘贴 JSON（格式：[{"value":20000,"count":1}, ...]）');
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        window.alert('JSON 必须是数组。');
        return;
      }
      const nextTiers = parsed.map((item) => {
        const row = item as Partial<PrizeTier>;
        return {
          value: Math.max(0, Number(row.value) || 0),
          count: Math.max(0, Math.floor(Number(row.count) || 0)),
        };
      });
      onTiersChange(nextTiers);
    } catch {
      window.alert('JSON 解析失败，请检查格式。');
    }
  };

  const exportJson = async () => {
    const text = JSON.stringify(tiers, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      window.alert('已复制当前奖池 JSON 到剪贴板。');
    } catch {
      window.prompt('复制以下 JSON：', text);
    }
  };

  return (
    <section className="card">
      <h2>奖池编辑（直播）</h2>
      <div className="pool-toolbar">
        <button type="button" onClick={() => onTiersChange(TEMPLATE_TIERS)}>一键填充示例模板</button>
        <button type="button" onClick={addTier}>新增行</button>
        <button type="button" onClick={importJson}>导入 JSON</button>
        <button type="button" onClick={exportJson}>导出 JSON</button>
      </div>

      <div className="tier-table">
        <div className="tier-header">面值</div>
        <div className="tier-header">剩余张数</div>
        <div className="tier-header">操作</div>
        {tiers.map((tier, index) => (
          <Fragment key={`tier-${index}`}>
            <input
              type="number"
              min={0}
              value={tier.value}
              onChange={(e) => updateTier(index, 'value', Number(e.target.value))}
            />
            <input
              type="number"
              min={0}
              step={1}
              value={tier.count}
              onChange={(e) => updateTier(index, 'count', Number(e.target.value))}
            />
            <button type="button" className="danger-btn" onClick={() => removeTier(index)}>
              删除
            </button>
          </Fragment>
        ))}
      </div>

      <div className="form-row">
        <label htmlFor="costPerEntry">单抽成本</label>
        <input
          id="costPerEntry"
          type="number"
          min={0.01}
          step={1}
          value={costPerEntry}
          onChange={(e) => onCostChange(Number(e.target.value) || 0)}
        />
      </div>

      <p className="info">当前奖池总卡数：{totalCount}</p>
      {validationErrors.map((error) => (
        <p key={error} className="warning">{error}</p>
      ))}
    </section>
  );
}
