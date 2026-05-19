import { coinflipGames, users } from '@caesar/shared/db/schema';
import {
  CoinflipSide,
  CoinflipStatus,
  type TCoinflipChallenge,
  type TCoinflipResult,
  type TCoinflipStateUpdate
} from '@caesar/shared/games/coinflip';
import { db } from '@server/db';
import { randomInt } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  CHALLENGE_EXPIRE_MS,
  FLIP_DURATION_MS,
  MAX_BET,
  MIN_BET
} from './constants';
import type { TCoinflipLedgerCallbacks } from './types';

type ActiveChallenge = {
  id: number;
  creatorLedgerEntryId: number;
  opponentLedgerEntryId: number | null;
  expireTimer: ReturnType<typeof setTimeout> | null;
};

class CoinflipRuntime {
  private callbacks: TCoinflipLedgerCallbacks;
  private activeTimers: Map<number, ActiveChallenge> = new Map();

  private stateSubscribers: Set<(state: TCoinflipStateUpdate) => void> =
    new Set();
  private resultSubscribers: Set<(result: TCoinflipResult) => void> = new Set();

  constructor(callbacks: TCoinflipLedgerCallbacks) {
    this.callbacks = callbacks;
  }

  async start() {
    // Clean up any stale pending/flipping challenges from previous server runs
    const stale = db
      .select({
        id: coinflipGames.id,
        creatorLedgerEntryId: coinflipGames.creatorLedgerEntryId,
        opponentLedgerEntryId: coinflipGames.opponentLedgerEntryId,
        status: coinflipGames.status,
        creatorId: coinflipGames.creatorId,
        opponentId: coinflipGames.opponentId
      })
      .from(coinflipGames)
      .where(
        inArray(coinflipGames.status, [
          CoinflipStatus.PENDING,
          CoinflipStatus.FLIPPING
        ])
      )
      .all();

    for (const game of stale) {
      // Refund both players
      if (game.creatorLedgerEntryId) {
        await this.callbacks.updateLedgerEntry(game.creatorLedgerEntryId, 0);
        await this.callbacks.onUserBalanceChanged(game.creatorId);
      }
      if (game.opponentLedgerEntryId) {
        await this.callbacks.updateLedgerEntry(game.opponentLedgerEntryId, 0);
        await this.callbacks.onUserBalanceChanged(game.opponentId!);
      }

      db.update(coinflipGames)
        .set({ status: 'expired', resolvedAt: Date.now() })
        .where(eq(coinflipGames.id, game.id))
        .run();
    }
  }

  subscribeToState(cb: (state: TCoinflipStateUpdate) => void): () => void {
    this.stateSubscribers.add(cb);
    return () => {
      this.stateSubscribers.delete(cb);
    };
  }

  subscribeToResult(cb: (result: TCoinflipResult) => void): () => void {
    this.resultSubscribers.add(cb);
    return () => {
      this.resultSubscribers.delete(cb);
    };
  }

  async getState(): Promise<TCoinflipStateUpdate> {
    return { challenges: await this.getActiveChallenges() };
  }

  async createChallenge(
    userId: number,
    side: CoinflipSide,
    amount: number
  ): Promise<number> {
    if (amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Bet must be between ${MIN_BET} and ${MAX_BET}`);
    }

    // Check if user already has a pending challenge
    const existing = db
      .select({ id: coinflipGames.id })
      .from(coinflipGames)
      .where(
        and(
          eq(coinflipGames.creatorId, userId),
          eq(coinflipGames.status, CoinflipStatus.PENDING)
        )
      )
      .get();

    if (existing) {
      throw new Error('You already have a pending challenge');
    }

    const balance = await this.callbacks.getBalance(userId);
    if (balance < amount) {
      throw new Error('Insufficient balance');
    }

    // Insert game row first to get the ID
    const game = db
      .insert(coinflipGames)
      .values({
        creatorId: userId,
        creatorSide: side,
        amount,
        status: CoinflipStatus.PENDING,
        createdAt: Date.now()
      })
      .returning({ id: coinflipGames.id })
      .get();

    const ledgerEntryId = await this.callbacks.createLedgerEntry(
      userId,
      -amount,
      game.id
    );

    db.update(coinflipGames)
      .set({ creatorLedgerEntryId: ledgerEntryId })
      .where(eq(coinflipGames.id, game.id))
      .run();

    const expireTimer = setTimeout(() => {
      this.expireChallenge(game.id);
    }, CHALLENGE_EXPIRE_MS);

    this.activeTimers.set(game.id, {
      id: game.id,
      creatorLedgerEntryId: ledgerEntryId,
      opponentLedgerEntryId: null,
      expireTimer
    });

    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);

    return game.id;
  }

  async acceptChallenge(challengeId: number, userId: number): Promise<void> {
    const game = db
      .select()
      .from(coinflipGames)
      .where(eq(coinflipGames.id, challengeId))
      .get();

    if (!game) throw new Error('Challenge not found');
    if (game.status !== CoinflipStatus.PENDING)
      throw new Error('Challenge is no longer available');
    if (game.creatorId === userId)
      throw new Error('You cannot accept your own challenge');

    const balance = await this.callbacks.getBalance(userId);
    if (balance < game.amount) throw new Error('Insufficient balance');

    const active = this.activeTimers.get(challengeId);
    if (active?.expireTimer) {
      clearTimeout(active.expireTimer);
      active.expireTimer = null;
    }

    const ledgerEntryId = await this.callbacks.createLedgerEntry(
      userId,
      -game.amount,
      challengeId
    );

    db.update(coinflipGames)
      .set({
        opponentId: userId,
        opponentLedgerEntryId: ledgerEntryId,
        status: CoinflipStatus.FLIPPING
      })
      .where(eq(coinflipGames.id, challengeId))
      .run();

    if (active) {
      active.opponentLedgerEntryId = ledgerEntryId;
    } else {
      this.activeTimers.set(challengeId, {
        id: challengeId,
        creatorLedgerEntryId: game.creatorLedgerEntryId!,
        opponentLedgerEntryId: ledgerEntryId,
        expireTimer: null
      });
    }

    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);

    setTimeout(() => {
      this.resolveChallenge(challengeId);
    }, FLIP_DURATION_MS);
  }

  async cancelChallenge(challengeId: number, userId: number): Promise<void> {
    const game = db
      .select()
      .from(coinflipGames)
      .where(eq(coinflipGames.id, challengeId))
      .get();

    if (!game) throw new Error('Challenge not found');
    if (game.creatorId !== userId)
      throw new Error('Only the creator can cancel');
    if (game.status !== CoinflipStatus.PENDING)
      throw new Error('Challenge cannot be cancelled');

    const active = this.activeTimers.get(challengeId);
    if (active?.expireTimer) {
      clearTimeout(active.expireTimer);
    }

    // Refund creator
    if (game.creatorLedgerEntryId) {
      await this.callbacks.updateLedgerEntry(game.creatorLedgerEntryId, 0);
    }

    db.update(coinflipGames)
      .set({ status: 'cancelled', resolvedAt: Date.now() })
      .where(eq(coinflipGames.id, challengeId))
      .run();

    this.activeTimers.delete(challengeId);
    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(userId);
  }

  // --- Private methods ---

  private async resolveChallenge(challengeId: number) {
    const game = db
      .select()
      .from(coinflipGames)
      .where(eq(coinflipGames.id, challengeId))
      .get();

    if (!game || game.status !== CoinflipStatus.FLIPPING) return;

    const result = randomInt(2) === 0 ? CoinflipSide.HEADS : CoinflipSide.TAILS;
    const creatorWins = result === game.creatorSide;

    const winnerId = creatorWins ? game.creatorId : game.opponentId!;
    const loserId = creatorWins ? game.opponentId! : game.creatorId;

    // Look up names
    const userRows = db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [winnerId, loserId]))
      .all();

    const winnerName =
      userRows.find((u) => u.id === winnerId)?.name ?? 'Unknown';
    const loserName = userRows.find((u) => u.id === loserId)?.name ?? 'Unknown';

    const winnerLedgerEntryId = creatorWins
      ? game.creatorLedgerEntryId!
      : game.opponentLedgerEntryId!;
    const loserLedgerEntryId = creatorWins
      ? game.opponentLedgerEntryId!
      : game.creatorLedgerEntryId!;

    await this.callbacks.updateLedgerEntry(winnerLedgerEntryId, game.amount);
    await this.callbacks.updateLedgerEntry(loserLedgerEntryId, -game.amount);

    db.update(coinflipGames)
      .set({
        status: CoinflipStatus.RESOLVED,
        result,
        winnerId,
        resolvedAt: Date.now()
      })
      .where(eq(coinflipGames.id, challengeId))
      .run();

    const coinflipResult: TCoinflipResult = {
      challengeId,
      result,
      winnerId,
      winnerName,
      loserId,
      loserName,
      amount: game.amount
    };

    this.notifyStateSubscribers();
    this.notifyResultSubscribers(coinflipResult);

    await this.callbacks.onUserBalanceChanged(winnerId);
    await this.callbacks.onUserBalanceChanged(loserId);

    // Clean up from active timers after delay
    setTimeout(() => {
      this.activeTimers.delete(challengeId);
      this.notifyStateSubscribers();
    }, 5_000);
  }

  private async expireChallenge(challengeId: number) {
    const game = db
      .select()
      .from(coinflipGames)
      .where(eq(coinflipGames.id, challengeId))
      .get();

    if (!game || game.status !== CoinflipStatus.PENDING) return;

    if (game.creatorLedgerEntryId) {
      await this.callbacks.updateLedgerEntry(game.creatorLedgerEntryId, 0);
    }

    db.update(coinflipGames)
      .set({ status: 'expired', resolvedAt: Date.now() })
      .where(eq(coinflipGames.id, challengeId))
      .run();

    this.activeTimers.delete(challengeId);
    this.notifyStateSubscribers();
    await this.callbacks.onUserBalanceChanged(game.creatorId);
  }

  private async getActiveChallenges(): Promise<TCoinflipChallenge[]> {
    const games = await db
      .select()
      .from(coinflipGames)
      .where(
        inArray(coinflipGames.status, [
          CoinflipStatus.PENDING,
          CoinflipStatus.FLIPPING,
          CoinflipStatus.RESOLVED
        ])
      )
      .all();

    // Filter out resolved games older than 5 seconds
    const now = Date.now();
    const activeGames = games.filter((g) => {
      if (g.status === CoinflipStatus.RESOLVED && g.resolvedAt) {
        return now - g.resolvedAt < 5_000;
      }
      return true;
    });

    // Look up all user names
    const userIds = new Set<number>();
    for (const g of activeGames) {
      userIds.add(g.creatorId);
      if (g.opponentId) userIds.add(g.opponentId);
    }

    const userRows =
      userIds.size > 0
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, Array.from(userIds)))
            .all()
        : [];

    const nameMap = new Map(userRows.map((u) => [u.id, u.name]));

    return activeGames.map((g) => ({
      id: g.id,
      creatorId: g.creatorId,
      creatorName: nameMap.get(g.creatorId) ?? 'Unknown',
      creatorSide: g.creatorSide as CoinflipSide,
      amount: g.amount,
      opponentId: g.opponentId,
      opponentName: g.opponentId
        ? (nameMap.get(g.opponentId) ?? 'Unknown')
        : null,
      status: g.status as CoinflipStatus,
      result: g.result as CoinflipSide | null,
      winnerId: g.winnerId,
      createdAt: g.createdAt
    }));
  }

  private notifyStateSubscribers() {
    const state = this.getState();
    for (const cb of this.stateSubscribers) cb(state);
  }

  private notifyResultSubscribers(result: TCoinflipResult) {
    for (const cb of this.resultSubscribers) cb(result);
  }
}

export { CoinflipRuntime };
