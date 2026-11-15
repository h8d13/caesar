import {
  ChannelPermission,
  Permission,
  ServerEvents,
  TEMP_ROOM_MAX_PARTICIPANTS
} from '@caesar/shared';
import { createMockContext } from '@server/__tests__/context';
import { getMockedToken, initTest } from '@server/__tests__/helpers';
import { loadTestMediasoup } from '@server/__tests__/mediasoup';
import { guestRouter } from '@server/routers/guest';
import {
  closeTempRoom,
  sweepTempRooms
} from '@server/runtimes/temp-room-lifecycle';
import {
  findTempRoomById,
  findTempRoomByToken,
  getAllTempRooms
} from '@server/runtimes/temp-rooms';
import { VoiceRuntime } from '@server/runtimes/voice';
import { createGuestContext } from '@server/utils/guest-wss';
import { pubsub } from '@server/utils/pubsub';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { IncomingMessage } from 'http';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi
} from 'vite-plus/test';

const state = { micMuted: true, soundMuted: false };

// a guest socket: no token, no cookie, its own context and router
const initGuest = async (remoteAddress = '10.0.0.1') => {
  const ctx = await createGuestContext({
    info: {},
    req: { headers: {}, socket: { remoteAddress } } as IncomingMessage,
    res: undefined
  } as unknown as CreateWSSContextFnOptions);

  return { ctx, guest: guestRouter.createCaller(ctx) };
};

describe('temp rooms', () => {
  beforeAll(async () => {
    await loadTestMediasoup();
  });

  afterEach(async () => {
    for (const room of getAllTempRooms()) await closeTempRoom(room, 'test');
  });

  test('the guest router exposes room voice and nothing else', () => {
    expect(Object.keys(guestRouter._def.procedures).sort()).toEqual(
      [
        'tempRooms.joinAsGuest',
        'tempRooms.onParticipants',
        'voice.closeProducer',
        'voice.connectConsumerTransport',
        'voice.connectProducerTransport',
        'voice.consume',
        'voice.createConsumerTransport',
        'voice.createProducerTransport',
        'voice.getProducers',
        'voice.leave',
        'voice.onChannelState',
        'voice.onJoin',
        'voice.onLeave',
        'voice.onNewProducer',
        'voice.onProducerClosed',
        'voice.onUpdateState',
        'voice.pauseConsumer',
        'voice.produce',
        'voice.requestKeyFrame',
        'voice.resumeConsumer',
        'voice.setConsumerQuality',
        'voice.updateState'
      ].sort()
    );
  });

  test('creating a room needs CREATE_TEMP_ROOMS', async () => {
    const { caller: member } = await initTest(2);

    await expect(member.tempRooms.create({})).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('a guest joins by link and shares the room with a member', async () => {
    const { caller: owner } = await initTest(1);
    const room = await owner.tempRooms.create({ name: 'Standup' });

    expect(room.id).toBeLessThan(0);

    await owner.tempRooms.join({ token: room.token, state });

    const { guest, ctx } = await initGuest();
    const joined = await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: '  Ada‮ ​ Lovelace ',
      state
    });

    expect(joined.ownId).toBe(ctx.userId);
    expect(joined.ownId).toBeLessThan(0);
    expect(joined.room.name).toBe('Standup');
    // control and format characters are gone, whitespace collapsed
    expect(joined.participants).toEqual([
      { id: 1, name: 'Test Owner', isGuest: false },
      { id: ctx.userId, name: 'Ada Lovelace', isGuest: true }
    ]);
    expect(Object.keys(joined.voice.users).map(Number)).toEqual(
      expect.arrayContaining([1, ctx.userId])
    );

    // the shared voice procedures run for both
    await guest.voice.createProducerTransport();
    await guest.voice.createConsumerTransport();
    await owner.voice.createProducerTransport();
    expect(await guest.voice.getProducers()).toEqual({
      remoteVideoIds: [],
      remoteAudioIds: [],
      remoteScreenIds: [],
      remoteScreenAudioIds: []
    });

    await guest.voice.updateState({ micMuted: false });
    expect(
      VoiceRuntime.findById(room.id)!.getUserState(ctx.userId).micMuted
    ).toBe(false);

    await guest.voice.leave();

    expect(findTempRoomById(room.id)!.participants.has(ctx.userId)).toBe(false);
    expect(VoiceRuntime.findRuntimeByUserId(ctx.userId)).toBeUndefined();

    await owner.voice.leave();
  });

  test('a guest socket can do nothing before or outside a room', async () => {
    const { caller: owner } = await initTest(1);
    const room = await owner.tempRooms.create({});
    const { guest, ctx } = await initGuest();

    await expect(guest.voice.createProducerTransport()).rejects.toThrow(
      'You must be authenticated to perform this action.'
    );
    await expect(guest.voice.onJoin()).rejects.toThrow(
      'You must be authenticated to perform this action.'
    );

    await expect(
      guest.tempRooms.joinAsGuest({ token: 'nope', name: 'Eve', state })
    ).rejects.toThrow('This room link is invalid or has expired');

    await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Eve',
      state
    });

    // no server permission, and no channel but the room
    expect(await ctx.hasPermission(Permission.JOIN_VOICE_CHANNELS)).toBe(false);
    expect(
      await ctx.hasChannelPermission(1, ChannelPermission.VIEW_CHANNEL)
    ).toBe(false);
    expect(
      await ctx.hasChannelPermission(room.id, ChannelPermission.SHARE_SCREEN)
    ).toBe(true);

    const other = await owner.tempRooms.create({});

    expect(
      await ctx.hasChannelPermission(other.id, ChannelPermission.VIEW_CHANNEL)
    ).toBe(false);
  });

  test('only who is in the room sees it, the owner included', async () => {
    const { caller: owner } = await initTest(1);
    const room = await owner.tempRooms.create({});
    const ownerCtx = await createMockContext({
      customToken: await getMockedToken(1)
    });
    const outsiderCtx = await createMockContext({
      customToken: await getMockedToken(2)
    });

    // the owner bypass of private channels does not reach a temp room
    expect(
      await ownerCtx.hasChannelPermission(
        room.id,
        ChannelPermission.VIEW_CHANNEL
      )
    ).toBe(false);

    const { guest } = await initGuest();
    const received: unknown[] = [];
    const { caller: outsider } = await initTest(2);
    const sub = (await outsider.tempRooms.onParticipants()).subscribe({
      next: (data) => received.push(data)
    });

    await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Bob',
      state
    });

    expect(received).toEqual([]);
    expect(
      await outsiderCtx.hasChannelPermission(
        room.id,
        ChannelPermission.VIEW_CHANNEL
      )
    ).toBe(false);

    sub.unsubscribe();
  });

  test('closing a room empties it and kills the link', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);
    const room = await owner.tempRooms.create({});
    const { guest, ctx } = await initGuest();

    await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Bob',
      state
    });

    const left: number[] = [];
    const sub = pubsub.subscribe(ServerEvents.USER_LEAVE_VOICE).subscribe({
      next: (data) => left.push(data.userId)
    });

    // not the creator, no MANAGE_TEMP_ROOMS
    await expect(member.tempRooms.close({ roomId: room.id })).rejects.toThrow(
      'Insufficient permissions'
    );

    await owner.tempRooms.close({ roomId: room.id });
    sub.unsubscribe();

    expect(left).toEqual([ctx.userId]);
    expect(findTempRoomByToken(room.token)).toBeUndefined();
    expect(VoiceRuntime.findById(room.id)).toBeUndefined();
    // the room is gone and a guest has no permission anywhere else
    await expect(guest.voice.createProducerTransport()).rejects.toThrow(
      'Insufficient permissions'
    );
    await expect(
      guest.tempRooms.joinAsGuest({ token: room.token, name: 'Bob', state })
    ).rejects.toThrow('This room link is invalid or has expired');
  });

  test('a kicked guest cannot come back with the same link', async () => {
    const { caller: owner } = await initTest(1);
    const room = await owner.tempRooms.create({});
    const { guest, ctx } = await initGuest('10.0.0.7');

    await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Mallory',
      state
    });
    await owner.tempRooms.kickGuest({ roomId: room.id, guestId: ctx.userId });

    expect(VoiceRuntime.findRuntimeByUserId(ctx.userId)).toBeUndefined();

    const { guest: again } = await initGuest('10.0.0.7');

    await expect(
      again.tempRooms.joinAsGuest({ token: room.token, name: 'Mallory', state })
    ).rejects.toThrow('This room link is invalid or has expired');

    // someone else still gets in
    const { guest: other } = await initGuest('10.0.0.8');

    await other.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Carol',
      state
    });

    // members are not kicked through this route
    await owner.tempRooms.join({ token: room.token, state });
    await expect(
      owner.tempRooms.kickGuest({ roomId: room.id, guestId: 1 })
    ).rejects.toThrow('Guest not found in this room');
    await owner.voice.leave();
  });

  test("MANAGE_TEMP_ROOMS, not MANAGE_USERS, opens other people's rooms", async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);
    const room = await owner.tempRooms.create({});
    const memberRole = {
      roleId: 2,
      name: 'Member',
      color: '#99aab5',
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    };

    await owner.roles.update({
      ...memberRole,
      permissions: [Permission.MANAGE_USERS]
    });

    expect(await member.tempRooms.list()).toEqual([]);
    await expect(member.tempRooms.close({ roomId: room.id })).rejects.toThrow(
      'Insufficient permissions'
    );

    await owner.roles.update({
      ...memberRole,
      permissions: [Permission.MANAGE_TEMP_ROOMS]
    });

    expect((await member.tempRooms.list()).map((r) => r.id)).toEqual([room.id]);

    await member.tempRooms.close({ roomId: room.id });

    expect(findTempRoomById(room.id)).toBeUndefined();
  });

  test('list updates reach the creator and managers only', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);
    const { caller: other } = await initTest(3);
    const seen = { owner: 0, member: 0, other: 0 };
    const subs = [
      (await owner.tempRooms.onChanged()).subscribe({
        next: () => seen.owner++
      }),
      (await member.tempRooms.onChanged()).subscribe({
        next: () => seen.member++
      }),
      (await other.tempRooms.onChanged()).subscribe({
        next: () => seen.other++
      })
    ];

    await owner.roles.update({
      roleId: 2,
      name: 'Member',
      color: '#99aab5',
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0,
      permissions: [Permission.CREATE_TEMP_ROOMS]
    });

    // opened by a member: they and the owner (who manages all) hear of it
    const room = await member.tempRooms.create({});

    await vi.waitFor(() => expect(seen.owner).toBe(1));
    expect(seen.member).toBe(1);

    // someone entering or leaving changes the count the list shows
    const { guest } = await initGuest();

    await guest.tempRooms.joinAsGuest({
      token: room.token,
      name: 'Bob',
      state
    });

    await vi.waitFor(() => expect(seen.owner).toBe(2));
    expect(seen.member).toBe(2);
    expect((await owner.tempRooms.list())[0]!.participants).toHaveLength(1);

    await guest.voice.leave();

    await vi.waitFor(() => expect(seen.owner).toBe(3));
    expect((await owner.tempRooms.list())[0]!.participants).toHaveLength(0);

    await member.tempRooms.close({ roomId: room.id });

    await vi.waitFor(() => expect(seen.owner).toBe(4));
    expect(seen.member).toBe(4);
    // same role, not the creator, no MANAGE_TEMP_ROOMS
    expect(seen.other).toBe(0);

    for (const sub of subs) sub.unsubscribe();
  });

  test('a full room refuses the next guest', async () => {
    const { caller: owner } = await initTest(1);
    const room = await owner.tempRooms.create({});

    for (let i = 0; i < TEMP_ROOM_MAX_PARTICIPANTS; i++) {
      const { guest } = await initGuest(`10.1.0.${i}`);

      await guest.tempRooms.joinAsGuest({
        token: room.token,
        name: `Guest ${i}`,
        state
      });
    }

    const { guest } = await initGuest('10.1.1.1');

    await expect(
      guest.tempRooms.joinAsGuest({ token: room.token, name: 'Late', state })
    ).rejects.toThrow('This room is full');
  });

  test('a room closes when its creator loses the permission', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);
    const memberRole = {
      roleId: 2,
      name: 'Member',
      color: '#99aab5',
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    };

    await owner.roles.update({
      ...memberRole,
      permissions: [Permission.CREATE_TEMP_ROOMS]
    });

    const room = await member.tempRooms.create({});

    expect((await member.tempRooms.list()).map((r) => r.id)).toEqual([room.id]);

    await sweepTempRooms();
    expect(findTempRoomById(room.id)).toBeDefined();

    await owner.roles.update({ ...memberRole, permissions: [] });
    await sweepTempRooms();

    expect(findTempRoomById(room.id)).toBeUndefined();
  });
});
