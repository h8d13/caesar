import { describe, expect, test } from 'vite-plus/test';
import { deriveAuthKey } from '../password';

// The client derives the same key in the browser
// (apps/client/src/lib/__tests__/e2ee.test.ts pins the same vector), so a
// temporary password the server issues only works if both agree byte for
// byte.
describe('deriveAuthKey', () => {
  test('matches the vector shared with the client', async () => {
    expect(await deriveAuthKey('pässwörd123', 'testowner')).toBe(
      'A51r7dBGr0LdQjndqpFSB8zTT0jUxDny6B5K0npjqV4='
    );
  });
});
