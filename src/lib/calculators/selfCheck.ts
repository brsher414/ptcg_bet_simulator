import { canContinueAfterLock, getMaxPlayableDraws } from './rules';
import { calcSingleDrawEV } from './ev';
import type { PrizeTier } from '../../types/pool';

const defaultTiers: PrizeTier[] = [
  { value: 20000, count: 1 },
  { value: 8000, count: 4 },
  { value: 3000, count: 5 },
  { value: 1000, count: 7 },
  { value: 300, count: 32 },
];

const totalCards = defaultTiers.reduce((sum, tier) => sum + tier.count, 0);
const totalValue = defaultTiers.reduce((sum, tier) => sum + tier.value * tier.count, 0);

export const selfCheckCases = {
  defaultPool: {
    tiers: defaultTiers,
    totalCards,
    totalValue,
    averagePerDraw: totalValue / totalCards,
    entryCost: 3000,
  },
  lockCaseNotUnlocked: {
    openedPacksThisRound: 0,
    unlockRequiredPacks: 15,
    canContinueAfterLock: canContinueAfterLock(0, 15),
    maxPlayableDraws: getMaxPlayableDraws({ totalCards: 49, lockAtCount: 10, openedPacksThisRound: 0, unlockRequiredPacks: 15 }),
  },
  lockCaseUnlocked: {
    openedPacksThisRound: 16,
    unlockRequiredPacks: 15,
    canContinueAfterLock: canContinueAfterLock(16, 15),
    maxPlayableDraws: getMaxPlayableDraws({ totalCards: 49, lockAtCount: 10, openedPacksThisRound: 16, unlockRequiredPacks: 15 }),
  },
  singleDrawEV: calcSingleDrawEV({ totalRemaining: totalCards, tiers: defaultTiers }, 3000),
};
