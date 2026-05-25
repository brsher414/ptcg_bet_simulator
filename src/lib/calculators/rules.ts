export function getMaxPlayableDraws(totalCards: number, stopAtCount: number): number {
  return Math.max(0, totalCards - stopAtCount);
}

export function clampPlannedDraws(
  plannedN: number,
  totalCards: number,
  stopAtCount: number,
): number {
  const maxPlayableDraws = getMaxPlayableDraws(totalCards, stopAtCount);
  return Math.min(Math.max(0, plannedN), maxPlayableDraws);
}

export type CalcMode = 'drawToFloor' | 'fixedDraws' | 'chaseJackpot';

export function resolveDrawsByMode(
  mode: CalcMode,
  plannedN: number,
  totalCards: number,
  stopAtCount: number,
): number {
  const maxPlayableDraws = getMaxPlayableDraws(totalCards, stopAtCount);

  switch (mode) {
    case 'drawToFloor':
      return maxPlayableDraws;
    case 'fixedDraws':
    case 'chaseJackpot':
      return clampPlannedDraws(plannedN, totalCards, stopAtCount);
    default: {
      const exhaustiveCheck: never = mode;
      return exhaustiveCheck;
    }
  }
}
