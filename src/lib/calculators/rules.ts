export interface LockRuleOptions {
  totalCards: number;
  lockAtCount: number;
  openedPacksThisRound: number;
  unlockRequiredPacks: number;
}

export function canContinueAfterLock(
  openedPacksThisRound: number,
  unlockRequiredPacks: number,
): boolean {
  return openedPacksThisRound > unlockRequiredPacks;
}

export function getMaxPlayableDraws(options: LockRuleOptions): number {
  const { totalCards, lockAtCount, openedPacksThisRound, unlockRequiredPacks } = options;
  if (totalCards <= 0) return 0;
  if (canContinueAfterLock(openedPacksThisRound, unlockRequiredPacks)) return totalCards;
  return Math.max(0, totalCards - lockAtCount);
}

export function clampPlannedDraws(plannedN: number, options: LockRuleOptions): number {
  const maxPlayableDraws = getMaxPlayableDraws(options);
  return Math.min(Math.max(0, Math.floor(plannedN)), maxPlayableDraws);
}
