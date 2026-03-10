export enum CoinflipSide {
  HEADS = 'heads',
  TAILS = 'tails'
}

export enum CoinflipStatus {
  PENDING = 'pending',
  FLIPPING = 'flipping',
  RESOLVED = 'resolved'
}

export type TCoinflipChallenge = {
  id: number;
  creatorId: number;
  creatorName: string;
  creatorSide: CoinflipSide;
  amount: number;
  opponentId: number | null;
  opponentName: string | null;
  status: CoinflipStatus;
  result: CoinflipSide | null;
  winnerId: number | null;
  createdAt: number;
};

export type TCoinflipStateUpdate = {
  challenges: TCoinflipChallenge[];
};

export type TCoinflipResult = {
  challengeId: number;
  result: CoinflipSide;
  winnerId: number;
  winnerName: string;
  loserId: number;
  loserName: string;
  amount: number;
};
