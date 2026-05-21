import { userWebauthnCredentials } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, t } from '@server/utils/trpc';
import {
  consumeChallenge,
  EXPECTED_ORIGIN,
  generateLoginOptions,
  hashUserId,
  RP_ID,
  RP_NAME,
  storeChallenge,
  verifyLoginAssertion
} from '@server/utils/webauthn';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON
} from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const getUserCredentials = async (userId: number) =>
  db
    .select()
    .from(userWebauthnCredentials)
    .where(eq(userWebauthnCredentials.userId, userId))
    .all();

const registerStart = protectedProcedure.mutation(async ({ ctx }) => {
  const existing = await getUserCredentials(ctx.userId);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: hashUserId(ctx.userId),
    userName: ctx.user.identity,
    userDisplayName: ctx.user.name,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ?? undefined
    })),
    authenticatorSelection: {
      residentKey: 'discouraged',
      userVerification: 'preferred'
    }
  });

  storeChallenge(ctx.userId, 'register', options.challenge);

  return options;
});

const registerFinish = protectedProcedure
  .input(
    z.object({
      response: z.unknown(),
      name: z.string().min(1).max(64).optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const expectedChallenge = consumeChallenge(ctx.userId, 'register');

    invariant(expectedChallenge, {
      code: 'BAD_REQUEST',
      message: 'No active registration challenge. Start over.'
    });

    const verification = await verifyRegistrationResponse({
      response: input.response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID
    });

    invariant(verification.verified && verification.registrationInfo, {
      code: 'BAD_REQUEST',
      message: 'Registration verification failed.'
    });

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    await db.insert(userWebauthnCredentials).values({
      userId: ctx.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: input.name ?? null,
      createdAt: Date.now()
    });

    return { verified: true };
  });

const list = protectedProcedure.query(async ({ ctx }) => {
  const rows = await getUserCredentials(ctx.userId);
  return rows.map((r) => ({
    id: r.id,
    credentialId: r.credentialId,
    name: r.name,
    deviceType: r.deviceType,
    backedUp: r.backedUp,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt
  }));
});

const remove = protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .delete(userWebauthnCredentials)
      .where(
        and(
          eq(userWebauthnCredentials.id, input.id),
          eq(userWebauthnCredentials.userId, ctx.userId)
        )
      )
      .returning({ id: userWebauthnCredentials.id });

    invariant(result.length > 0, {
      code: 'NOT_FOUND',
      message: 'Credential not found.'
    });

    return { removed: true };
  });

// Step-up auth: re-prove possession of a key for sensitive actions while
// already logged in. Login-time 2FA lives in http/login-2fa.ts and shares
// the same verify helpers.
const authenticateStart = protectedProcedure.mutation(async ({ ctx }) => {
  const options = await generateLoginOptions(ctx.userId);

  invariant(options, {
    code: 'NOT_FOUND',
    message: 'No registered credentials.'
  });

  return options;
});

const authenticateFinish = protectedProcedure
  .input(z.object({ response: z.unknown() }))
  .mutation(async ({ ctx, input }) => {
    const result = await verifyLoginAssertion(
      ctx.userId,
      input.response as AuthenticationResponseJSON
    );

    invariant(result.verified, {
      code: 'UNAUTHORIZED',
      message: 'Authentication verification failed.'
    });

    return { verified: true };
  });

const webauthnRouter = t.router({
  registerStart,
  registerFinish,
  list,
  remove,
  authenticateStart,
  authenticateFinish
});

export { webauthnRouter };
