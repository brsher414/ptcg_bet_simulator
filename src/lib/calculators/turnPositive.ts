import type { PrizeTier } from '../../types/pool';

export interface TurnPositiveResult {
  removeValue: number;
  availableCount: number;
  neededCount: number | null;
  possible: boolean;
  effect: 'helpful' | 'neutral' | 'harmful' | 'alreadyPositive' | 'impossible';
  reason: string;
}

export function calculateCardsNeededToTurnPositive(tiers: PrizeTier[], costPerEntry: number): TurnPositiveResult[] {
  const totalCards = tiers.reduce((s, t) => s + Math.max(0, t.count), 0);
  const totalValue = tiers.reduce((s, t) => s + t.value * Math.max(0, t.count), 0);
  const average = totalCards > 0 ? totalValue / totalCards : 0;

  return tiers.map((tier) => {
    const availableCount = Math.max(0, tier.count);
    if (average >= costPerEntry) return { removeValue: tier.value, availableCount, neededCount: 0, possible: true, effect: 'alreadyPositive', reason: '当前已是正期望。' };
    if (tier.value === costPerEntry) return { removeValue: tier.value, availableCount, neededCount: null, possible: false, effect: 'neutral', reason: '抽走该档位不改变均值。' };
    if (tier.value > costPerEntry) return { removeValue: tier.value, availableCount, neededCount: null, possible: false, effect: 'harmful', reason: '抽走高于成本的卡会让均值更差。' };

    const needed = Math.ceil((costPerEntry * totalCards - totalValue) / (costPerEntry - tier.value));
    if (needed <= availableCount) return { removeValue: tier.value, availableCount, neededCount: needed, possible: true, effect: 'helpful', reason: '仅抽走此档位可转正。' };
    return { removeValue: tier.value, availableCount, neededCount: needed, possible: false, effect: 'impossible', reason: '该档位数量不够，无法仅靠它转正。' };
  });
}
