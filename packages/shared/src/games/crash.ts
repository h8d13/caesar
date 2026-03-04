export enum CrashPhase {
  BETTING = 'betting',
  FLYING = 'flying',
  CRASHED = 'crashed'
}

export type TCrashActiveBet = {
  userId: number;
  userName: string;
  amount: number;
  cashedOutAt: number | null;
  profit: number | null;
};

export type TCrashStateUpdate = {
  phase: CrashPhase;
  roundId: number;
  multiplier: number;
  phaseStartedAt: number;
  phaseDuration: number | null;
  bets: TCrashActiveBet[];
};

export type TCrashRoundResult = {
  roundId: number;
  crashPoint: number;
  bets: TCrashActiveBet[];
};

export type TCrashRoundHistory = {
  id: number;
  crashPoint: number;
  createdAt: number;
};
