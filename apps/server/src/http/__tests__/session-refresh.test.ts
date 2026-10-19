import { getSessionCookie, initTest } from '@server/__tests__/helpers';
import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vite-plus/test';

const redeem = (nonce: string, currentToken?: string) =>
  fetch(`${testsBaseUrl}/session/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { 'x-token': currentToken } : {})
    },
    body: JSON.stringify({ nonce })
  });

describe('/session/refresh', () => {
  test('redeems a staged nonce into the new cookie, once', async () => {
    const { caller, mockedToken } = await initTest(1);
    const { refreshNonce } = await caller.users.signOutOtherSessions();

    const first = await redeem(refreshNonce, mockedToken);

    expect(first.status).toBe(200);
    expect(getSessionCookie(first)).toBeTruthy();
    expect((await redeem(refreshNonce, mockedToken)).status).toBe(401);
  });

  test('needs a session cookie for the same user', async () => {
    const { caller } = await initTest(1);
    const { mockedToken: otherUserToken } = await initTest(2);
    const { refreshNonce } = await caller.users.signOutOtherSessions();

    expect((await redeem(refreshNonce)).status).toBe(401);

    const { refreshNonce: second } = await caller.users.signOutOtherSessions();

    expect((await redeem(second, otherUserToken)).status).toBe(401);
  });

  test('rejects a made-up nonce', async () => {
    const { mockedToken } = await initTest(1);

    expect((await redeem('nope', mockedToken)).status).toBe(401);
  });

  test('an epoch bump after staging kills the staged session', async () => {
    const { caller, mockedToken } = await initTest(1);
    const { refreshNonce } = await caller.users.signOutOtherSessions();

    // any later epoch bump (here a second sign-out) revokes the staged token
    await caller.users.signOutOtherSessions();

    expect((await redeem(refreshNonce, mockedToken)).status).toBe(401);
  });
});
