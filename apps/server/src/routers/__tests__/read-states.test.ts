import { directMessages } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { describe, expect, test } from 'vitest';

describe('joinServer channel visibility', () => {
  test('a private channel leaks neither its row nor its unread count', async () => {
    const { caller: owner } = await initTest(1);

    for (const content of ['one', 'two', 'three']) {
      await owner.messages.send({ channelId: 1, content, files: [] });
    }

    await owner.channels.update({
      channelId: 1,
      name: 'staff-only',
      topic: null,
      private: true
    });

    // user 2 holds no VIEW_CHANNEL grant on the now-private channel
    const { initialData } = await initTest(2);

    expect(initialData.channels.map((c) => c.id)).not.toContain(1);
    expect(initialData.readStates[1]).toBeUndefined();
  });

  test('the owner does not receive DMs between other users', async () => {
    const dm = await tdb.select().from(directMessages).get();

    expect(dm).toBeDefined();
    expect([dm!.userOneId, dm!.userTwoId]).not.toContain(1);

    const { initialData } = await initTest(1);

    expect(initialData.channels.map((c) => c.id)).not.toContain(dm!.channelId);
    expect(initialData.readStates[dm!.channelId]).toBeUndefined();
    expect(initialData.channelPermissions[dm!.channelId]).toBeUndefined();
  });
});
