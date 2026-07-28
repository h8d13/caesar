// RP config derived from CAESAR_SITE. Challenges live in an in-memory Map
// with short TTL.

import { userWebauthnCredentials } from '@caesar/shared/db/schema';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { getServerTokenSync } from '../db/queries/server';
import { parseSite } from '../helpers/parse-site';
import { IS_DEVELOPMENT } from './env';

// Throws at boot on a multi-host CAESAR_SITE, see helpers/parse-site.
const SITE = parseSite(process.env.CAESAR_SITE);

const RP_ID = SITE.host;
const RP_NAME = process.env.CAESAR_WEBAUTHN_RPNAME ?? 'Caesar';
// Dev also accepts the vite origin so :5173 and :8443 are interchangeable.
const EXPECTED_ORIGIN = IS_DEVELOPMENT
  ? [SITE.origin, 'http://localhost:5173']
  : [SITE.origin];

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type ChallengeEntry = {
  challenge: string;
  expiresAt: number;
};

const challenges = new Map<string, ChallengeEntry>();

const challengeKey = (userId: number, purpose: 'register' | 'auth'): string =>
  `${purpose}:${userId}`;

const storeChallenge = (
  userId: number,
  purpose: 'register' | 'auth',
  challenge: string
): void => {
  challenges.set(challengeKey(userId, purpose), {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });
};

const consumeChallenge = (
  userId: number,
  purpose: 'register' | 'auth'
): string | undefined => {
  const key = challengeKey(userId, purpose);
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) {
    return undefined;
  }
  return entry.challenge;
};

// HMAC of the internal user ID under the server secret. Stable per user,
// opaque to the outside. Mirrors `hashIp`.
const hashUserId = (userId: number): Uint8Array<ArrayBuffer> => {
  const buf = crypto
    .createHmac('sha256', getServerTokenSync())
    .update(String(userId))
    .digest();
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
};

const generateLoginOptions = async (
  userId: number
): Promise<PublicKeyCredentialRequestOptionsJSON | null> => {
  const credentials = await db
    .select()
    .from(userWebauthnCredentials)
    .where(eq(userWebauthnCredentials.userId, userId))
    .all();

  if (credentials.length === 0) {
    return null;
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ?? undefined
    })),
    userVerification: 'preferred'
  });

  storeChallenge(userId, 'auth', options.challenge);

  return options;
};

const verifyLoginAssertion = async (
  userId: number,
  response: AuthenticationResponseJSON
): Promise<
  | { verified: true }
  | {
      verified: false;
      reason: 'no_challenge' | 'unknown_credential' | 'verification_failed';
    }
> => {
  const expectedChallenge = consumeChallenge(userId, 'auth');
  if (!expectedChallenge) {
    return { verified: false, reason: 'no_challenge' };
  }

  const credential = await db
    .select()
    .from(userWebauthnCredentials)
    .where(
      and(
        eq(userWebauthnCredentials.userId, userId),
        eq(userWebauthnCredentials.credentialId, response.id)
      )
    )
    .get();

  if (!credential) {
    return { verified: false, reason: 'unknown_credential' };
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? undefined
    }
  });

  if (!verification.verified) {
    return { verified: false, reason: 'verification_failed' };
  }

  await db
    .update(userWebauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: Date.now()
    })
    .where(eq(userWebauthnCredentials.id, credential.id));

  return { verified: true };
};

const hasWebauthnCredentials = async (userId: number): Promise<boolean> => {
  const row = await db
    .select({ id: userWebauthnCredentials.id })
    .from(userWebauthnCredentials)
    .where(eq(userWebauthnCredentials.userId, userId))
    .limit(1)
    .get();
  return !!row;
};

export {
  CHALLENGE_TTL_MS,
  consumeChallenge,
  EXPECTED_ORIGIN,
  generateLoginOptions,
  hashUserId,
  hasWebauthnCredentials,
  RP_ID,
  RP_NAME,
  storeChallenge,
  verifyLoginAssertion
};
