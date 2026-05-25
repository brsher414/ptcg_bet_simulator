import { canContinueAfterLock, getMaxPlayableDraws } from './rules';
import { calcSingleDrawEV } from './ev';

export const selfCheckCases = {
  case1: (() => {
    const can = canContinueAfterLock(0, 15);
    const max = getMaxPlayableDraws({ totalCards: 49, lockAtCount: 10, openedPacksThisRound: 0, unlockRequiredPacks: 15 });
    return { can, max };
  })(),
  case2: (() => {
    const can = canContinueAfterLock(16, 15);
    const max = getMaxPlayableDraws({ totalCards: 49, lockAtCount: 10, openedPacksThisRound: 16, unlockRequiredPacks: 15 });
    return { can, max };
  })(),
  case4: (() => calcSingleDrawEV({ totalRemaining: 49, tiers: [{ value: 20000, count: 1 }, { value: 8000, count: 4 }, { value: 3000, count: 5 }, { value: 1000, count: 7 }, { value: 300, count: 32 }] }, 3000))(),
};
