export interface PrizeTier {
  value: number;
  count: number;
}

export interface PoolState {
  tiers: PrizeTier[];
  totalRemaining: number;
}

export interface CalcInput {
  costPerEntry: number;
  stopAtCount: number;
  plannedDrawCount: number;
  targetJackpotValue: number;
}

export interface CalcOutput {
  expectedValue: number;
  hitProbability: number;
  riskMetrics: {
    breakEvenProbability: number;
    maxDrawdown: number;
    variance: number;
  };
}
