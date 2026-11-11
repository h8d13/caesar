import { createHmac } from 'crypto';
import { describe, expect, test } from 'vite-plus/test';
import { decodeJwt, getJwtSecret, signJwt, verifyJwt } from '../jwt-secret';

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

// a token built by hand, with whatever header / payload / key the test wants
const forge = async (
  header: object,
  payload: object,
  secret?: string
): Promise<string> => {
  const data = `${b64(header)}.${b64(payload)}`;
  const signature = createHmac('sha256', secret ?? (await getJwtSecret()))
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
};

const HS256 = { alg: 'HS256', typ: 'JWT' };
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('session token signing', () => {
  test('a signed token verifies and carries its claims, iat and exp', async () => {
    const token = await signJwt({ userId: 7, sessionEpoch: 2 }, 60);
    const payload = await verifyJwt<Record<string, number>>(token);

    expect(payload.userId).toBe(7);
    expect(payload.sessionEpoch).toBe(2);
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  test('accepts a standard HS256 token signed with the same key', async () => {
    // sessions issued before the in-house signer must keep working
    const token = await forge(HS256, { userId: 1, exp: inAnHour() });

    expect((await verifyJwt<{ userId: number }>(token)).userId).toBe(1);
  });

  test('rejects a tampered payload', async () => {
    const token = await signJwt({ userId: 2 }, 60);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${b64({ userId: 1, exp: inAnHour() })}.${signature}`;

    await expect(verifyJwt(forged)).rejects.toThrow('invalid signature');
  });

  test('rejects a token signed with another key', async () => {
    const token = await forge(HS256, { userId: 1, exp: inAnHour() }, 'other');

    await expect(verifyJwt(token)).rejects.toThrow('invalid signature');
  });

  test('rejects alg none and any algorithm other than HS256', async () => {
    const payload = { userId: 1, exp: inAnHour() };
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;

    await expect(verifyJwt(unsigned)).rejects.toThrow('invalid algorithm');
    await expect(
      verifyJwt(await forge({ alg: 'HS512', typ: 'JWT' }, payload))
    ).rejects.toThrow('invalid algorithm');
  });

  test('rejects an expired token and one without exp', async () => {
    const past = Math.floor(Date.now() / 1000) - 1;

    await expect(
      verifyJwt(await forge(HS256, { userId: 1, exp: past }))
    ).rejects.toThrow('token expired');
    await expect(verifyJwt(await forge(HS256, { userId: 1 }))).rejects.toThrow(
      'token expired'
    );
  });

  test('rejects malformed input', async () => {
    for (const token of ['', 'a.b', 'a.b.c', 'a.b.c.d', '..']) {
      await expect(verifyJwt(token)).rejects.toThrow();
    }
  });

  test('decodeJwt reads a claim without verifying and never throws', async () => {
    const token = await signJwt({ remember: true }, 60);

    expect(decodeJwt<{ remember: boolean }>(token)?.remember).toBe(true);
    expect(decodeJwt('garbage')).toBeNull();
  });
});
