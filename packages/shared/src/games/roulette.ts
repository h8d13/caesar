export enum RoulettePhase {
  BETTING = 'betting',
  SPINNING = 'spinning',
  RESULT = 'result'
}

export enum RouletteBetType {
  STRAIGHT = 'straight',
  RED = 'red',
  BLACK = 'black',
  ODD = 'odd',
  EVEN = 'even',
  LOW = 'low',
  HIGH = 'high',
  DOZEN_1 = 'dozen_1',
  DOZEN_2 = 'dozen_2',
  DOZEN_3 = 'dozen_3',
  COLUMN_1 = 'column_1',
  COLUMN_2 = 'column_2',
  COLUMN_3 = 'column_3'
}

export const RED_NUMBERS = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
];
export const BLACK_NUMBERS = [
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35
];

export const PAYOUT_MAP: Record<RouletteBetType, number> = {
  [RouletteBetType.STRAIGHT]: 29,
  [RouletteBetType.RED]: 1,
  [RouletteBetType.BLACK]: 1,
  [RouletteBetType.ODD]: 1,
  [RouletteBetType.EVEN]: 1,
  [RouletteBetType.LOW]: 1,
  [RouletteBetType.HIGH]: 1,
  [RouletteBetType.DOZEN_1]: 2,
  [RouletteBetType.DOZEN_2]: 2,
  [RouletteBetType.DOZEN_3]: 2,
  [RouletteBetType.COLUMN_1]: 2,
  [RouletteBetType.COLUMN_2]: 2,
  [RouletteBetType.COLUMN_3]: 2
};

export const LIGHTNING_MULTIPLIERS = [50, 100, 200, 500] as const;

export type TLightningNumber = {
  number: number;
  multiplier: number;
};

export type TRouletteActiveBet = {
  betId: number;
  userId: number;
  userName: string;
  betType: RouletteBetType;
  betValue: number | null; // number for STRAIGHT bets, null for outside bets
  amount: number;
  profit: number | null;
};

export type TRouletteStateUpdate = {
  phase: RoulettePhase;
  roundId: number;
  phaseStartedAt: number;
  phaseDuration: number;
  winningNumber: number | null; // only revealed during RESULT phase
  bets: TRouletteActiveBet[];
  lightningNumbers: TLightningNumber[];
};

export type TRouletteRoundResult = {
  roundId: number;
  winningNumber: number;
  bets: TRouletteActiveBet[];
  lightningNumbers: TLightningNumber[];
};

export type TRouletteRoundHistory = {
  id: number;
  winningNumber: number;
  createdAt: number;
  lightningNumbers: TLightningNumber[];
};

export const isBetWinner = (
  betType: RouletteBetType,
  betValue: number | null,
  winningNumber: number
): boolean => {
  if (winningNumber === 0)
    return betType === RouletteBetType.STRAIGHT && betValue === 0;

  switch (betType) {
    case RouletteBetType.STRAIGHT:
      return betValue === winningNumber;
    case RouletteBetType.RED:
      return RED_NUMBERS.includes(winningNumber);
    case RouletteBetType.BLACK:
      return BLACK_NUMBERS.includes(winningNumber);
    case RouletteBetType.ODD:
      return winningNumber % 2 === 1;
    case RouletteBetType.EVEN:
      return winningNumber % 2 === 0;
    case RouletteBetType.LOW:
      return winningNumber >= 1 && winningNumber <= 18;
    case RouletteBetType.HIGH:
      return winningNumber >= 19 && winningNumber <= 36;
    case RouletteBetType.DOZEN_1:
      return winningNumber >= 1 && winningNumber <= 12;
    case RouletteBetType.DOZEN_2:
      return winningNumber >= 13 && winningNumber <= 24;
    case RouletteBetType.DOZEN_3:
      return winningNumber >= 25 && winningNumber <= 36;
    case RouletteBetType.COLUMN_1:
      return winningNumber % 3 === 1;
    case RouletteBetType.COLUMN_2:
      return winningNumber % 3 === 2;
    case RouletteBetType.COLUMN_3:
      return winningNumber % 3 === 0;
    default:
      return false;
  }
};
