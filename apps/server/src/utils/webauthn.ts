// WebAuthn (FIDO2 / U2F) relying party config and helpers.
//
// RP_ID is the registrable domain (no protocol, no port). Browsers bind
// credentials to this string, so it must stay stable across deploys.
// EXPECTED_ORIGIN is the full origin including scheme + port and is what
// the authenticator signed clientDataJSON against.
//
// Challenges for register / authenticate live in an in-memory Map with a
// short TTL. Acceptable for a single-process PoC; for multi-instance
// deploys, move to Redis or a DB row.

import { userWebauthnCredentials } from '@caesar/shared/db/schema';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { getServerTokenSync } from '../db/queries/server';

const RP_ID = process.env.CAESAR_WEBAUTHN_RPID ?? 'localhost';
const RP_NAME = process.env.CAESAR_WEBAUTHN_RPNAME ?? 'Caesar';
// Comma-separated list. Lets a single instance accept both vite dev
// (http://localhost:5173) and the prod origin without re-deploying.
const EXPECTED_ORIGIN = (
  process.env.CAESAR_WEBAUTHN_ORIGIN ?? 'http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

// Opaque, stable per-user handle for the WebAuthn `userHandle` field. HMAC
// of the internal user ID under the server secret so a stolen credential
// blob doesn't leak the integer ID, but the same user always gets the same
// handle across sessions (required for the authenticator to recognize
// them). Mirrors the `hashIp` pattern.
const hashUserId = (userId: number): Uint8Array<ArrayBuffer> => {
  const buf = crypto
    .createHmac('sha256', getServerTokenSync())
    .update(String(userId))
    .digest();
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
};

// Build the authentication options for a user and stash the challenge.
// Returns `null` if the user has no registered credentials.
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

// Consume the stored challenge, verify the assertion, bump the credential's
// counter + lastUsedAt. Returns a verdict plus an opaque `reason` for
// server-side logging. Caller decides what to surface to the client.
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
  EXPECTED_ORIGIN,
  RP_ID,
  RP_NAME,
  consumeChallenge,
  generateLoginOptions,
  hashUserId,
  hasWebauthnCredentials,
  storeChallenge,
  verifyLoginAssertion
};
