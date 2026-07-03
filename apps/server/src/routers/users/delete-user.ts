import {
  ActivityLogType,
  DELETED_USER_IDENTITY_AND_NAME,
  DisconnectCode,
  Permission,
  ServerEvents
} from '@caesar/shared';
import {
  emojis,
  files,
  messageReactions,
  messages,
  users
} from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getUserByIdentity } from '@server/db/queries/users';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { pubsub } from '@server/utils/pubsub';
import { protectedProcedure } from '@server/utils/trpc';
import { randomUUIDv7 } from '@server/utils/uuid';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import z from 'zod';
import { assertCanModifyOwnerUser } from './assert-can-modify-owner-user';

const ensureDeletedUser = async (): Promise<number> => {
  const existingDeletedUser = await getUserByIdentity(
    DELETED_USER_IDENTITY_AND_NAME
  );

  if (existingDeletedUser) {
    return existingDeletedUser.id;
  }

  const insertedDeletedUser = await db
    .insert(users)
    .values({
      identity: DELETED_USER_IDENTITY_AND_NAME,
      password: randomUUIDv7(),
      name: DELETED_USER_IDENTITY_AND_NAME,
      avatarId: null,
      bannerId: null,
      bio: null,
      bannerColor: null,
      createdAt: Date.now()
    })
    .returning({ id: users.id })
    .get();

  if (!insertedDeletedUser) {
    throw new Error('Failed to create deleted user placeholder');
  }

  await publishUser(insertedDeletedUser.id, 'create');

  return insertedDeletedUser.id;
};

type TPerformUserDeletionArgs = {
  targetUserId: number;
  actorUserId: number;
  wipe: boolean;
  reason: string;
  userWs: WebSocket | undefined;
};

const performUserDeletion = async ({
  targetUserId,
  actorUserId,
  wipe,
  reason,
  userWs
}: TPerformUserDeletionArgs) => {
  const targetUser = await db
    .select({
      id: users.id,
      identity: users.identity,
      avatarId: users.avatarId,
      bannerId: users.bannerId
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .get();

  invariant(targetUser, {
    code: 'NOT_FOUND',
    message: 'User not found.'
  });

  invariant(targetUser.identity !== DELETED_USER_IDENTITY_AND_NAME, {
    code: 'BAD_REQUEST',
    message: 'Cannot delete the deleted user placeholder.'
  });

  if (userWs) {
    userWs.close(DisconnectCode.KICKED, reason);
  }

  const deletedUserId = await ensureDeletedUser();

  await db.transaction(async (tx) => {
    if (!wipe) {
      // Reassign everything to deleted user placeholder

      await tx
        .update(messages)
        .set({ userId: deletedUserId })
        .where(eq(messages.userId, targetUserId));

      await tx
        .update(emojis)
        .set({ userId: deletedUserId })
        .where(eq(emojis.userId, targetUserId));

      await tx
        .update(messageReactions)
        .set({ userId: deletedUserId })
        .where(eq(messageReactions.userId, targetUserId));

      await tx
        .update(files)
        .set({ userId: deletedUserId })
        .where(eq(files.userId, targetUserId));
    } else {
      // cascade will handle deleting all related data
    }

    await tx.delete(users).where(eq(users.id, targetUserId));
  });

  pubsub.publish(ServerEvents.USER_DELETE, {
    isWipe: wipe,
    userId: targetUserId,
    deletedUserId
  });

  enqueueActivityLog({
    type: ActivityLogType.USER_DELETED,
    userId: targetUserId,
    details: {
      reason,
      deletedBy: actorUserId
    }
  });
};

const deleteUserRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      wipe: z.boolean().default(false)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    invariant(input.userId !== ctx.user.id, {
      code: 'BAD_REQUEST',
      message: 'You cannot delete yourself.'
    });

    await assertCanModifyOwnerUser(ctx.userId, input.userId, 'delete');

    await performUserDeletion({
      targetUserId: input.userId,
      actorUserId: ctx.userId,
      wipe: input.wipe,
      reason: 'Your account has been deleted',
      userWs: ctx.getUserWs(input.userId)
    });
  });

export { deleteUserRoute, performUserDeletion };
