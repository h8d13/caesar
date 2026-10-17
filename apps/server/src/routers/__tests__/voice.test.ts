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
});
