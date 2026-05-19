import { initTest } from '@server/__tests__/helpers';
import { describe, expect, test } from 'vitest';

// Voice runtime requires the mediasoup native worker. `bun test:fast`
// (SKIP_MEDIASOUP=1) leaves it unloaded, so the suite skips entirely.
const d = process.env.SKIP_MEDIASOUP ? describe.skip : describe;

d('voice router', () => {
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
});
