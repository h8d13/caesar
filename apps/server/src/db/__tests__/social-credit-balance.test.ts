import { socialCreditLedger, users } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { createGameLedgerBindings } from '@server/games/shared-bindings';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, test } from 'vite-plus/test';

// users.social_credit is trigger-maintained; it must equal the ledger SUM
// after every kind of ledger write, cascades included.
const expectInSync = async () => {
  const rows = await tdb
    .select({
      id: users.id,
      stored: users.socialCredit,
      // spelled out: a single-table select renders ${users.id} unqualified,
      // which would bind to the ledger's own id
      summed: sql<number>`(SELECT COALESCE(SUM(amount), 0)
        FROM social_credit_ledger WHERE target_id = users.id)`
    })
    .from(users);

  for (const row of rows) expect(row.stored, `user ${row.id}`).toBe(row.summed);

  return Object.fromEntries(rows.map((r) => [r.id, r.stored]));
};

describe('users.social_credit balance', () => {
  test('stays equal to SUM(ledger.amount) across every writer', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: user2 } = await initTest(2);
    const { caller: user3 } = await initTest(3);

    // user votes (insert)
    await user2.users.voteSocialCredit({ targetUserId: 3, type: 'upvote' });
    await owner.users.voteSocialCredit({ targetUserId: 2, type: 'downvote' });
    expect(await expectInSync()).toMatchObject({ 2: -5, 3: 10 });

    // message votes: insert, switch (update), toggle off (delete)
    await user3.messages.toggleScVote({ messageId: 1, type: 'upvote' });
    expect((await expectInSync())[1]).toBe(1);
    await user3.messages.toggleScVote({ messageId: 1, type: 'downvote' });
    expect((await expectInSync())[1]).toBe(-1);
    await user3.messages.toggleScVote({ messageId: 1, type: 'downvote' });
    expect((await expectInSync())[1]).toBe(0);

    // game bets: insert then settle (update), read through getBalance
    const game = createGameLedgerBindings('coinflip');
    const entryId = await game.createLedgerEntry(3, -50, 1);
    expect(await game.getBalance(3)).toBe(-40);
    await game.updateLedgerEntry(entryId, 80);
    expect(await game.getBalance(3)).toBe(90);
    await expectInSync();

    // re-targeting an entry moves its amount between users
    await tdb
      .update(socialCreditLedger)
      .set({ targetId: 4 })
      .where(eq(socialCreditLedger.id, entryId));
    expect(await expectInSync()).toMatchObject({ 3: 10, 4: 80 });

    // deleting user 2 cascades its rows as target AND as voter: user 3
    // loses the +10 vote user 2 gave
    await owner.users.delete({ userId: 2 });
    expect((await expectInSync())[3]).toBe(0);
  });
});
