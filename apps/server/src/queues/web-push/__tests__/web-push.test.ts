import { ChannelPermission } from '@caesar/shared';
import {
  channels,
  channelUserPermissions,
  pushSubscriptions
} from '@caesar/shared/db/schema';
import { tdb } from '@server/__tests__/setup';
import * as webPushModule from '@server/utils/web-push';
import * as wssModule from '@server/utils/wss';
import { eq } from 'drizzle-orm';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vite-plus/test';
import { enqueueMessagePush } from '..';

// setupFiles already imported both modules (via the http server), so
// vi.mock would come too late; spyOn patches the live ESM bindings.
const sendWebPush = vi.spyOn(webPushModule, 'sendWebPush');
const getOnlineUserIds = vi.spyOn(wssModule, 'getOnlineUserIds');

// seed: 1 owner, 2 user, 3 userA, 4 userB; channel 1 public, 3 = A/B DM
const subscribe = (userId: number, prefs: { all?: boolean; dms?: boolean }) =>
  tdb.insert(pushSubscriptions).values({
    userId,
    endpoint: `https://push.test/${userId}`,
    p256dh: 'p256dh',
    auth: 'auth',
    notifyAll: prefs.all ?? false,
    notifyDms: prefs.dms ?? false,
    createdAt: Date.now()
  });

// All sends of one fan-out start synchronously in one Promise.all, so
// once any expected call shows up the full recipient set is known.
const pushedUserIds = async (expected: number) => {
  await vi.waitFor(() => {
    expect(sendWebPush.mock.calls.length).toBeGreaterThanOrEqual(expected);
  });

  return sendWebPush.mock.calls
    .map(([sub]) => Number(sub.endpoint.split('/').pop()))
    .sort((a, b) => a - b);
};

describe('enqueueMessagePush', () => {
  beforeEach(() => {
    sendWebPush.mockReset();
    sendWebPush.mockResolvedValue('sent');
    getOnlineUserIds.mockReset();
    getOnlineUserIds.mockReturnValue([2]);
  });

  afterEach(() => {
    getOnlineUserIds.mockReset();
  });

  test('public channel pushes offline subscribers except the author', async () => {
    for (const id of [1, 2, 3, 4]) await subscribe(id, { all: true });

    enqueueMessagePush({ channelId: 1, messageUserId: 1, content: 'hi' });

    expect(await pushedUserIds(2)).toEqual([3, 4]);
    expect(sendWebPush.mock.calls[0]![1]).toEqual({
      title: 'Test Owner in #General',
      body: 'You have a new message.'
    });
  });

  test('private channel pushes only users granted view', async () => {
    await tdb.update(channels).set({ private: true }).where(eq(channels.id, 1));
    await tdb.insert(channelUserPermissions).values({
      channelId: 1,
      userId: 3,
      permission: ChannelPermission.VIEW_CHANNEL,
      allow: true,
      createdAt: Date.now()
    });

    for (const id of [1, 2, 3, 4]) await subscribe(id, { all: true });

    // author 4 has no grant; owner 1 sees every private channel
    enqueueMessagePush({ channelId: 1, messageUserId: 4, content: 'hi' });

    expect(await pushedUserIds(2)).toEqual([1, 3]);
  });

  test('DM pushes the peer with DM prefs and prunes gone endpoints', async () => {
    await subscribe(3, { dms: true });
    await subscribe(4, { dms: true });
    sendWebPush.mockResolvedValue('gone');

    enqueueMessagePush({ channelId: 3, messageUserId: 3, content: 'hi' });

    expect(await pushedUserIds(1)).toEqual([4]);
    expect(sendWebPush.mock.calls[0]![1].title).toBe('User A');

    await vi.waitFor(async () => {
      const left = await tdb.select().from(pushSubscriptions);

      expect(left.map((sub) => sub.userId)).toEqual([3]);
    });
  });
});
