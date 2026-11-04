import { initTest } from '@server/__tests__/helpers';
import { describe, expect, test } from 'vite-plus/test';

// 32 bytes, base64 with padding: the shape the client sends
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

describe('keys.register', () => {
  test('stores a 32-byte base64 key and returns it to peers', async () => {
    const { caller } = await initTest(1);

    await caller.keys.register({ publicKey: VALID_KEY });

    const peer = await initTest(2);
    const { publicKey } = await peer.caller.keys.getPublic({ userId: 1 });

    expect(publicKey).toBe(VALID_KEY);
  });

  test('rejects anything that is not a 32-byte base64 key', async () => {
    const { caller } = await initTest(1);

    for (const publicKey of ['x', 'not base64 at all!', `${VALID_KEY}AA`]) {
      await expect(caller.keys.register({ publicKey })).rejects.toThrow();
    }
  });
});
