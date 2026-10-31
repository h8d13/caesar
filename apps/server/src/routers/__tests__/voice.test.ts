import {
  ChannelPermission,
  ChannelType,
  Permission,
  ServerEvents,
  StreamKind
} from '@caesar/shared';
import { createMockContext } from '@server/__tests__/context';
import {
  getMockedToken,
  initTest,
  type TCaller
} from '@server/__tests__/helpers';
import { appRouter } from '@server/routers';
import { VoiceRuntime } from '@server/runtimes/voice';
import { loadMediasoup } from '@server/utils/mediasoup';
import { pubsub } from '@server/utils/pubsub';
import type { Observable } from '@trpc/server/observable';
import { beforeAll, describe, expect, test, vi } from 'vite-plus/test';

// Voice runtime requires the mediasoup native worker. `pnpm test:fast`
// (SKIP_MEDIASOUP=1) leaves it unloaded, so the suite skips entirely.
// We load mediasoup here (not the global setup) so that only this fork
// binds the WebRTC port and other parallel forks don't collide on it.
const d = process.env.SKIP_MEDIASOUP ? describe.skip : describe;

d('voice router', () => {
  beforeAll(async () => {
    await loadMediasoup();
  });

  test('should rate limit excessive voice join attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 20; i++) {
      // channelId 999999 doesn't exist; the handler throws 'Channel not
      // found' before reaching the permission check. Specific message is
      // incidental — the point is each call still consumes a rate token.
      await expect(
        caller.voice.join({
          channelId: 999999,
          state: {
            micMuted: false,
            soundMuted: false
          }
        })
      ).rejects.toThrow('Channel not found');
    }

    await expect(
      caller.voice.join({
        channelId: 999999,
        state: {
          micMuted: false,
          soundMuted: false
        }
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('re-creating a producer transport closes the old one and keeps the new', async () => {
    const { caller } = await initTest(1);

    const channelId = await caller.channels.add({
      type: ChannelType.VOICE,
      name: 'voice-transports',
      categoryId: 1
    });

    const runtime = VoiceRuntime.findById(channelId)!;

    await runtime.createProducerTransport(1);
    const first = runtime.getProducerTransport(1)!;

    await runtime.createProducerTransport(1);
    const second = runtime.getProducerTransport(1)!;

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
    expect(second).not.toBe(first);

    second.close();
    expect(runtime.getProducerTransport(1)).toBeUndefined();
  });

  test('moderators cannot move a user out of a DM call', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const voiceChannelId = await owner.channels.add({
      type: ChannelType.VOICE,
      name: 'voice-move-target',
      categoryId: 1
    });

    const { channelId: dmChannelId } = await caller2.dms.open({ userId: 3 });

    await caller2.dms.startCall({ channelId: dmChannelId });

    await caller2.voice.join({
      channelId: dmChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    try {
      await expect(
        owner.voice.moveUser({ userId: 2, channelId: voiceChannelId })
      ).rejects.toThrow('User is not in a voice channel');
    } finally {
      await caller2.voice.leave();
    }
  });

  test('DM calls need no JOIN_VOICE_CHANNELS past join either', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: caller3 } = await initTest(3);
    const DM_CHANNEL_ID = 3; // seeded DM between users 3 and 4

    // Member role (users 3 and 4) keeps DMs, loses server voice
    await owner.roles.update({
      roleId: 2,
      name: 'Member',
      color: '#99aab5',
      permissions: [Permission.USE_DMS],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    await caller3.dms.startCall({ channelId: DM_CHANNEL_ID });
    await caller3.voice.join({
      channelId: DM_CHANNEL_ID,
      state: { micMuted: true, soundMuted: false }
    });

    try {
      await caller3.voice.createProducerTransport();
      await caller3.voice.closeProducer({ kind: StreamKind.AUDIO });
    } finally {
      await caller3.voice.leave();
      await caller3.dms.hangupCall({ channelId: DM_CHANNEL_ID });
    }

    expect(VoiceRuntime.findById(DM_CHANNEL_ID)).toBeUndefined();
    // server voice channels still need the permission
    await expect(
      caller3.voice.join({
        channelId: 2,
        state: { micMuted: true, soundMuted: false }
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('a member who loses JOIN mid-call can still close their stream', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(3);
    const voiceChannelId = await owner.channels.add({
      type: ChannelType.VOICE,
      name: 'voice-revoke',
      categoryId: 1
    });
    const memberRole = (await owner.roles.getAll()).find((r) => r.id === 2)!;
    const setMemberPermissions = (permissions: Permission[]) =>
      owner.roles.update({
        roleId: 2,
        name: memberRole.name,
        color: memberRole.color,
        permissions,
        storageQuotaOverrideEnabled: false,
        storageSpaceQuota: 0
      });

    await member.voice.join({
      channelId: voiceChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    try {
      await setMemberPermissions(
        memberRole.permissions.filter(
          (p) => p !== Permission.JOIN_VOICE_CHANNELS
        )
      );

      await expect(
        member.voice.closeProducer({ kind: StreamKind.AUDIO })
      ).resolves.toBeUndefined();
      // every other voice step still needs the permission
      await expect(member.voice.createProducerTransport()).rejects.toThrow(
        'Insufficient permissions'
      );
    } finally {
      await setMemberPermissions(memberRole.permissions);
      await member.voice.leave();
    }
  });

  test('deleting a category tears down its voice runtimes', async () => {
    const { caller } = await initTest(1);

    const categoryId = await caller.categories.add({ name: 'voice-cat' });
    const doomedId = await caller.channels.add({
      type: ChannelType.VOICE,
      name: 'doomed',
      categoryId
    });
    const otherId = await caller.channels.add({
      type: ChannelType.VOICE,
      name: 'other',
      categoryId: 1
    });

    await caller.voice.join({
      channelId: doomedId,
      state: { micMuted: true, soundMuted: false }
    });

    await caller.categories.delete({ categoryId });

    expect(VoiceRuntime.findById(doomedId)).toBeUndefined();
    expect(VoiceRuntime.findRuntimeByUserId(1)).toBeUndefined();

    // not stuck as "already in a voice channel"
    await caller.voice.join({
      channelId: otherId,
      state: { micMuted: true, soundMuted: false }
    });
    await caller.voice.leave();
  });
});

// No mediasoup needed: the listener only reads ctx.currentVoiceChannelId,
// which join.ts would have set.
describe('voice producer events', () => {
  const voiceChannelId = 2;

  const listen = async (userId: number) => {
    const ctx = await createMockContext({
      customToken: await getMockedToken(userId)
    });
    const received: unknown[] = [];

    ctx.authenticated = true;
    ctx.currentVoiceChannelId = voiceChannelId;

    const events = await appRouter.createCaller(ctx).voice.onNewProducer();
    const sub = (events as unknown as Observable<unknown, unknown>).subscribe({
      next: (data) => received.push(data)
    });

    return { received, unsubscribe: () => sub.unsubscribe() };
  };

  const publish = () =>
    pubsub.publishForChannel(voiceChannelId, ServerEvents.VOICE_NEW_PRODUCER, {
      channelId: voiceChannelId,
      remoteId: 1,
      kind: StreamKind.AUDIO
    });

  const grant = (owner: TCaller, userId: number, join: boolean) =>
    owner.channels.updatePermissions({
      channelId: voiceChannelId,
      userId,
      permissions: join
        ? [ChannelPermission.VIEW_CHANNEL, ChannelPermission.JOIN]
        : [ChannelPermission.VIEW_CHANNEL]
    });

  test('a revoked JOIN stops events while others in the call keep them', async () => {
    const { caller: owner } = await initTest(1);

    await owner.channels.update({
      channelId: voiceChannelId,
      name: 'Voice',
      topic: null,
      private: true
    });
    await grant(owner, 2, true);
    await grant(owner, 3, true);

    const kept = await listen(2);
    const revoked = await listen(3);

    try {
      publish();
      await vi.waitFor(() => {
        expect(kept.received).toHaveLength(1);
        expect(revoked.received).toHaveLength(1);
      });

      await grant(owner, 3, false);
      publish();
      await vi.waitFor(() => expect(kept.received).toHaveLength(2));
      // the denied listener runs the same checks; give it the same turns
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(revoked.received).toHaveLength(1);
    } finally {
      kept.unsubscribe();
      revoked.unsubscribe();
    }
  });
});
