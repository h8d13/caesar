import {
  isBetWinner,
  LIGHTNING_MULTIPLIERS,
  PAYOUT_MAP,
  type RouletteBetType,
  RoulettePhase,
  type TLightningNumber,
  type TRouletteActiveBet,
  type TRouletteRoundHistory,
  type TRouletteRoundResult,
  type TRouletteStateUpdate
} from '@caesar/shared/games/roulette';
import { randomInt } from 'crypto';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../db';
import { rouletteBets, rouletteRounds } from '../../db/schema';
import {
  BETTING_PHASE_DURATION_MS,
  MAX_BET,
  MAX_BETS_PER_USER,
  MIN_BET,
  RESULT_PHASE_DURATION_MS,
  SPINNING_PHASE_DURATION_MS
} from './constants';
import type { TRouletteLedgerCallbacks } from './types';

type ActiveBetInternal = {
  betId: number;
  userId: number;
  userName: string;
  betType: RouletteBetType;
  betValue: number | null;
  amount: number;
  ledgerEntryId: number;
  profit: number | null;
};

class RouletteRuntime {
  private callbacks: TRouletteLedgerCallbacks;
  private phase: RoulettePhase = RoulettePhase.BETTING;
  private roundId: number = 0;
  private winningNumber: number = 0;
  private phaseStartedAt: number = 0;
  private activeBets: ActiveBetInternal[] = [];
  private lightningNumbers: TLightningNumber[] = [];

  private stateSubscribers: Set<(state: TRouletteStateUpdate) => void> =
    new Set();
  private resultSubscribers: Set<(result: TRouletteRoundResult) => void> =
    new Set();

  constructor(callbacks: TRouletteLedgerCallbacks) {
    this.callbacks = callbacks;
  }

  async start() {
    await this.startBettingPhase();
  }

  subscribeToState(cb: (state: TRouletteStateUpdate) => void): () => void {
    this.stateSubscribers.add(cb);
    return () => {
      this.stateSubscribers.delete(cb);
    };
  }

  subscribeToResult(cb: (result: TRouletteRoundResult) => void): () => void {
    this.resultSubscribers.add(cb);
    return () => {
      this.resultSubscribers.delete(cb);
    };
  }

  getState(): TRouletteStateUpdate {
    return {
      phase: this.phase,
      roundId: this.roundId,
      phaseStartedAt: this.phaseStartedAt,
      phaseDuration: this.getPhaseDuration(),
      winningNumber:
        this.phase === RoulettePhase.BETTING ? null : this.winningNumber,
      bets: this.getPublicBets(),
      lightningNumbers:
        this.phase === RoulettePhase.BETTING ? [] : this.lightningNumbers
    };
  }

  getHistory(limit: number = 20): TRouletteRoundHistory[] {
    const rows = db
      .select({
        id: rouletteRounds.id,
        winningNumber: rouletteRounds.winningNumber,
        lightningNumbers: rouletteRounds.lightningNumbers,
        createdAt: rouletteRounds.startedAt
      })
      .from(rouletteRounds)
      .where(isNotNull(rouletteRounds.endedAt))
      .orderBy(desc(rouletteRounds.id))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      id: row.id,
      winningNumber: row.winningNumber,
      createdAt: row.createdAt,
      lightningNumbers: JSON.parse(row.lightningNumbers) as TLightningNumber[]
    }));
  }

  async placeBet(
    userId: number,
    userName: string,
    betType: RouletteBetType,
    betValue: number | null,
    amount: number
  ): Promise<void> {
    if (this.phase !== RoulettePhase.BETTING) {
      throw new Error('Bets can only be placed during the betting phase');
    }

    if (amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Bet must be between ${MIN_BET} and ${MAX_BET}`);
    }

    const userBetCount = this.activeBets.filter(
      (b) => b.userId === userId
    ).length;
    if (userBetCount >= MAX_BETS_PER_USER) {
      throw new Error(`Maximum ${MAX_BETS_PER_USER} bets per round`);
    }

    const balance = await this.callbacks.getBalance(userId);
    if (balance < amount) {
      throw new Error('Insufficient balance');
    }

    const ledgerEntryId = await this.callbacks.createLedgerEntry(
      userId,
      -amount,
      this.roundId
    );

    const bet = db
      .insert(rouletteBets)
      .values({
        roundId: this.roundId,
        userId,
        betType,
        betValue,
        amount,
        ledgerEntryId,
        createdAt: Date.now()
      })
      .returning({ id: rouletteBets.id })
      .get();

    this.activeBets.push({
      betId: bet.id,
      userId,
      userName,
      betType,
      betValue,
      amount,
      ledgerEntryId,
      profit: null
    });

    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);
  }

  async removeBet(userId: number, betId: number): Promise<void> {
    if (this.phase !== RoulettePhase.BETTING) {
      throw new Error('Bets can only be removed during the betting phase');
    }

    const betIndex = this.activeBets.findIndex(
      (b) => b.betId === betId && b.userId === userId
    );
    if (betIndex === -1) {
      throw new Error('Bet not found');
    }

    const bet = this.activeBets[betIndex];
    if (!bet) {
      throw new Error('Bet not found');
    }

    // Refund by setting ledger entry to 0
    await this.callbacks.updateLedgerEntry(bet.ledgerEntryId, 0);

    db.delete(rouletteBets).where(eq(rouletteBets.id, bet.betId)).run();

    this.activeBets.splice(betIndex, 1);

    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);
  }

  // --- Private methods ---

  private async startBettingPhase() {
    this.phase = RoulettePhase.BETTING;
    this.activeBets = [];
    this.winningNumber = this.generateWinningNumber();
    this.lightningNumbers = this.generateLightningNumbers();
    this.phaseStartedAt = Date.now();

    const round = db
      .insert(rouletteRounds)
      .values({
        winningNumber: this.winningNumber,
        lightningNumbers: JSON.stringify(this.lightningNumbers),
        hash: this.hashWinningNumber(this.winningNumber),
        startedAt: this.phaseStartedAt
      })
      .returning({ id: rouletteRounds.id })
      .get();

    this.roundId = round.id;

    this.notifyStateSubscribers();

    setTimeout(() => {
      this.startSpinningPhase();
    }, BETTING_PHASE_DURATION_MS);
  }

  private startSpinningPhase() {
    this.phase = RoulettePhase.SPINNING;
    this.phaseStartedAt = Date.now();

    this.notifyStateSubscribers();

    setTimeout(() => {
      this.startResultPhase();
    }, SPINNING_PHASE_DURATION_MS);
  }

  private async startResultPhase() {
    this.phase = RoulettePhase.RESULT;
    this.phaseStartedAt = Date.now();

    // Resolve all bets
    for (const bet of this.activeBets) {
      try {
        const won = isBetWinner(bet.betType, bet.betValue, this.winningNumber);
        if (won) {
          // Check if this is a STRAIGHT bet on a lightning number
          const lightning = this.lightningNumbers.find(
            (ln) => ln.number === bet.betValue
          );
          const payoutMultiplier =
            bet.betType === 'straight' && lightning
              ? lightning.multiplier
              : PAYOUT_MAP[bet.betType];
          const profit = bet.amount * payoutMultiplier;
          bet.profit = profit;
          await this.callbacks.updateLedgerEntry(bet.ledgerEntryId, profit);
        } else {
          bet.profit = -bet.amount;
        }

        db.update(rouletteBets)
          .set({ profit: bet.profit })
          .where(eq(rouletteBets.id, bet.betId))
          .run();
      } catch (e) {
        console.error(`Failed to resolve roulette bet ${bet.betId}:`, e);
      }
    }

    db.update(rouletteRounds)
      .set({ endedAt: Date.now() })
      .where(eq(rouletteRounds.id, this.roundId))
      .run();

    const result: TRouletteRoundResult = {
      roundId: this.roundId,
      winningNumber: this.winningNumber,
      bets: this.getPublicBets(),
      lightningNumbers: this.lightningNumbers
    };

    // Notify balance changes for all users who had bets
    const userIds = new Set(this.activeBets.map((b) => b.userId));
    for (const userId of userIds) {
      await this.callbacks.onUserBalanceChanged(userId);
    }

    this.notifyStateSubscribers();
    this.notifyResultSubscribers(result);

    setTimeout(() => {
      this.startBettingPhase();
    }, RESULT_PHASE_DURATION_MS);
  }

  private generateLightningNumbers(): TLightningNumber[] {
    const count = randomInt(6); // 0-5 lightning numbers
    const available = Array.from({ length: 37 }, (_, i) => i); // 0-36
    const selected: TLightningNumber[] = [];

    for (let i = 0; i < count; i++) {
      const idx = randomInt(available.length);
      const num = available.splice(idx, 1)[0]!;
      const multiplier =
        LIGHTNING_MULTIPLIERS[randomInt(LIGHTNING_MULTIPLIERS.length)]!;
      selected.push({ number: num, multiplier });
    }

    return selected;
  }

  private generateWinningNumber(): number {
    return randomInt(37); // 0-36
  }

  private hashWinningNumber(number: number): string {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(String(number) + '-' + Date.now());
    return hasher.digest('hex');
  }

  private getPublicBets(): TRouletteActiveBet[] {
    return this.activeBets.map((b) => ({
      betId: b.betId,
      userId: b.userId,
      userName: b.userName,
      betType: b.betType,
      betValue: b.betValue,
      amount: b.amount,
      profit: b.profit
    }));
  }

  private getPhaseDuration(): number {
    if (this.phase === RoulettePhase.BETTING) return BETTING_PHASE_DURATION_MS;
    if (this.phase === RoulettePhase.SPINNING)
      return SPINNING_PHASE_DURATION_MS;
    return RESULT_PHASE_DURATION_MS;
  }

  private notifyStateSubscribers() {
    const state = this.getState();
    for (const cb of this.stateSubscribers) {
      cb(state);
    }
  }

  private notifyResultSubscribers(result: TRouletteRoundResult) {
    for (const cb of this.resultSubscribers) {
      cb(result);
    }
  }
}

export { RouletteRuntime };
