import { crashBets, crashRounds } from '@caesar/shared/db/schema';
import {
  CrashPhase,
  type TCrashActiveBet,
  type TCrashRoundHistory,
  type TCrashRoundResult,
  type TCrashStateUpdate
} from '@caesar/shared/games/crash';
import { db } from '@server/db';
import { createHash } from 'crypto';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { runDetached, withBalanceLock } from '../shared-bindings';
import {
  BETTING_PHASE_DURATION_MS,
  CRASHED_PHASE_DURATION_MS,
  HOUSE_EDGE,
  MAX_BET,
  MIN_BET,
  MULTIPLIER_GROWTH_RATE,
  MULTIPLIER_TICK_INTERVAL_MS
} from './constants';
import type { TCrashLedgerCallbacks } from './types';

type ActiveBetInternal = {
  betId: number;
  userId: number;
  userName: string;
  amount: number;
  ledgerEntryId: number;
  cashedOutAt: number | null;
  profit: number | null;
};

class CrashRuntime {
  private callbacks: TCrashLedgerCallbacks;
  private phase: CrashPhase = CrashPhase.BETTING;
  private roundId = 0;
  private crashPoint = 1;
  private multiplier = 1;
  private phaseStartedAt = 0;
  private flyingStartedAt = 0;
  private activeBets: ActiveBetInternal[] = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  private stateSubscribers: Set<(state: TCrashStateUpdate) => void> = new Set();
  private resultSubscribers: Set<(result: TCrashRoundResult) => void> =
    new Set();

  constructor(callbacks: TCrashLedgerCallbacks) {
    this.callbacks = callbacks;
  }

  async start() {
    await this.startBettingPhase();
  }

  subscribeToState(cb: (state: TCrashStateUpdate) => void): () => void {
    this.stateSubscribers.add(cb);
    return () => {
      this.stateSubscribers.delete(cb);
    };
  }

  subscribeToResult(cb: (result: TCrashRoundResult) => void): () => void {
    this.resultSubscribers.add(cb);
    return () => {
      this.resultSubscribers.delete(cb);
    };
  }

  getState(): TCrashStateUpdate {
    return {
      phase: this.phase,
      roundId: this.roundId,
      multiplier: this.multiplier,
      phaseStartedAt: this.phaseStartedAt,
      phaseDuration: this.getPhaseDuration(),
      bets: this.getPublicBets()
    };
  }

  async getHistory(limit = 20): Promise<TCrashRoundHistory[]> {
    const rows = await db
      .select({
        id: crashRounds.id,
        crashPoint: crashRounds.crashPoint,
        createdAt: crashRounds.startedAt
      })
      .from(crashRounds)
      .where(isNotNull(crashRounds.endedAt))
      .orderBy(desc(crashRounds.id))
      .limit(limit)
      .all();
    return rows.filter((r) => r.crashPoint > 0);
  }

  async placeBet(
    userId: number,
    userName: string,
    amount: number
  ): Promise<void> {
    // Locked: the one-bet-per-round check only holds once the bet is pushed.
    return withBalanceLock(userId, async () => {
      if (this.phase !== CrashPhase.BETTING) {
        throw new Error('Bets can only be placed during the betting phase');
      }

      if (amount < MIN_BET || amount > MAX_BET) {
        throw new Error(`Bet must be between ${MIN_BET} and ${MAX_BET}`);
      }

      if (this.activeBets.some((b) => b.userId === userId)) {
        throw new Error('You already have a bet this round');
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

      const bet = await db
        .insert(crashBets)
        .values({
          roundId: this.roundId,
          userId,
          amount,
          ledgerEntryId,
          createdAt: Date.now()
        })
        .returning({ id: crashBets.id })
        .get();

      this.activeBets.push({
        betId: bet.id,
        userId,
        userName,
        amount,
        ledgerEntryId,
        cashedOutAt: null,
        profit: null
      });

      this.notifyStateSubscribers();
      await this.callbacks.onUserBalanceChanged(userId);
    });
  }

  async cashOut(userId: number): Promise<void> {
    // No grace window after the crash: one used to pay the crash point (the
    // round's maximum) to a request landing just after it, so a client that
    // waited for the crash and answered at once won every round.
    if (this.phase !== CrashPhase.FLYING) {
      throw new Error('Can only cash out during the flying phase');
    }

    const bet = this.activeBets.find(
      (b) => b.userId === userId && b.cashedOutAt === null
    );
    if (!bet) {
      throw new Error('No active bet to cash out');
    }

    const cashoutMultiplier = this.multiplier;
    const payout = Math.floor(bet.amount * cashoutMultiplier);
    const profit = payout - bet.amount;

    bet.cashedOutAt = cashoutMultiplier;
    bet.profit = profit;

    await this.callbacks.updateLedgerEntry(bet.ledgerEntryId, profit);

    await db
      .update(crashBets)
      .set({ cashedOutAt: cashoutMultiplier, profit })
      .where(eq(crashBets.id, bet.betId))
      .run();

    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);
  }

  // --- Private methods ---

  private async startBettingPhase() {
    this.phase = CrashPhase.BETTING;
    this.multiplier = 1;
    this.activeBets = [];
    this.crashPoint = this.generateCrashPoint();
    this.phaseStartedAt = Date.now();

    const round = await db
      .insert(crashRounds)
      .values({
        crashPoint: this.crashPoint,
        hash: this.hashCrashPoint(this.crashPoint),
        startedAt: this.phaseStartedAt
      })
      .returning({ id: crashRounds.id })
      .get();

    this.roundId = round.id;

    this.notifyStateSubscribers();

    setTimeout(() => {
      runDetached('crash flying phase', this.startFlyingPhase());
    }, BETTING_PHASE_DURATION_MS);
  }

  private async startFlyingPhase() {
    if (this.activeBets.length === 0) {
      this.multiplier = this.crashPoint;
      await this.startCrashedPhase();
      return;
    }

    this.phase = CrashPhase.FLYING;
    this.phaseStartedAt = Date.now();
    this.flyingStartedAt = Date.now();
    this.multiplier = 1;

    this.notifyStateSubscribers();

    this.tickInterval = setInterval(() => {
      runDetached('crash tick', this.tick());
    }, MULTIPLIER_TICK_INTERVAL_MS);
  }

  private async tick() {
    const elapsed = (Date.now() - this.flyingStartedAt) / 1000;
    this.multiplier =
      Math.floor(Math.exp(MULTIPLIER_GROWTH_RATE * elapsed) * 100) / 100;

    if (this.multiplier >= this.crashPoint) {
      this.multiplier = this.crashPoint;
      await this.crash();
      return;
    }

    this.notifyStateSubscribers();
  }

  private async crash() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Mark all uncashed bets as busted
    for (const bet of this.activeBets) {
      if (bet.cashedOutAt === null) {
        bet.profit = -bet.amount;
      }
    }

    await this.startCrashedPhase();
  }

  private async startCrashedPhase() {
    this.phase = CrashPhase.CRASHED;
    this.phaseStartedAt = Date.now();

    await db
      .update(crashRounds)
      .set({ endedAt: Date.now() })
      .where(eq(crashRounds.id, this.roundId))
      .run();

    const result: TCrashRoundResult = {
      roundId: this.roundId,
      crashPoint: this.crashPoint,
      bets: this.getPublicBets()
    };

    this.notifyStateSubscribers();
    this.notifyResultSubscribers(result);

    setTimeout(() => {
      runDetached('crash betting phase', this.startBettingPhase());
    }, CRASHED_PHASE_DURATION_MS);
  }

  private generateCrashPoint(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const r = buf[0]! / (0xffffffff + 1); // [0, 1)
    return Math.max(1, Math.floor(((1 - HOUSE_EDGE) / r) * 100) / 100);
  }

  private hashCrashPoint(point: number): string {
    return createHash('sha256')
      .update(String(point) + '-' + Date.now())
      .digest('hex');
  }

  private getPublicBets(): TCrashActiveBet[] {
    return this.activeBets.map((b) => ({
      userId: b.userId,
      userName: b.userName,
      amount: b.amount,
      cashedOutAt: b.cashedOutAt,
      profit: b.profit
    }));
  }

  private getPhaseDuration(): number | null {
    if (this.phase === CrashPhase.BETTING) return BETTING_PHASE_DURATION_MS;
    if (this.phase === CrashPhase.CRASHED) return CRASHED_PHASE_DURATION_MS;
    return null;
  }

  private notifyStateSubscribers() {
    const state = this.getState();
    for (const cb of this.stateSubscribers) {
      cb(state);
    }
  }

  private notifyResultSubscribers(result: TCrashRoundResult) {
    for (const cb of this.resultSubscribers) {
      cb(result);
    }
  }
}

export { CrashRuntime };
