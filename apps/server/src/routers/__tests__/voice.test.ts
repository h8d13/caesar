import { ChannelType } from '@caesar/shared';
import { initTest } from '@server/__tests__/helpers';
import { VoiceRuntime } from '@server/runtimes/voice';
import { loadMediasoup } from '@server/utils/mediasoup';
import { beforeAll, describe, expect, test } from 'vite-plus/test';

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
