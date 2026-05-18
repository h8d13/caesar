import {
  canonicalIdentity,
  DisconnectCode,
  IDENTITY_REGEX,
  Permission
} from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getUserById } from '@server/db/queries/users';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const renameIdentityRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      identity: z.string()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    const target = await getUserById(input.userId);
    invariant(target, { code: 'NOT_FOUND', message: 'User not found' });

    const next = canonicalIdentity(input.identity);

    invariant(IDENTITY_REGEX.test(next), {
      code: 'BAD_REQUEST',
      message:
        'Identity must start with a letter or number and contain only letters, numbers, _ or -.'
    });

    const conflict = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.identity, next))
      .get();

    invariant(!conflict || conflict.id === input.userId, {
      code: 'CONFLICT',
      message: 'That identity is already taken.'
    });

    // If the display name was previously equal to the identity (default
    // signup state), keep them aligned. Otherwise preserve the user's
    // custom display name so a rename here doesn't stomp their chosen
    // name.
    const nextName = target.name === target.identity ? next : target.name;

    await db
      .update(users)
      .set({
        identity: next,
        name: nextName,
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
        updatedAt: Date.now()
      })
      .where(eq(users.id, input.userId));

    // Boot any active WS sessions for this user; their JWTs are now stale.
    closeUserSessions(
      input.userId,
      'Your account identity was changed by an admin. Please sign in again.',
      DisconnectCode.SESSION_SUPERSEDED
    );

    publishUser(input.userId, 'update');
  });

export { renameIdentityRoute };
