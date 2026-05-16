import { ActivityLogType, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { publishMessage } from '@server/db/publishers';
import { assertDmChannel } from '@server/db/queries/dms';
import { messages } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const toggleMessagePinRoute = protectedProcedure
  .input(
    z.object({
      messageId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.PIN_MESSAGES);

    const message = await db
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .get();

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertDmChannel(message.channelId, ctx.userId);

    invariant(!message.parentMessageId, {
      code: 'BAD_REQUEST',
      message: 'Cannot pin a thread message'
    });

    const now = Date.now();

    await db
      .update(messages)
      .set({
        pinned: !message.pinned,
        pinnedAt: now,
        pinnedBy: ctx.user.id,
        updatedAt: now
      })
      .where(eq(messages.id, input.messageId));

    publishMessage(input.messageId, message.channelId, 'update');
    enqueueActivityLog({
      type: ActivityLogType.TOGGLED_MESSAGE_PIN,
      userId: ctx.user.id,
      details: {
        messageId: input.messageId,
        channelId: message.channelId,
        pinned: !message.pinned,
        pinnedBy: ctx.user.id
      }
    });
  });

export { toggleMessagePinRoute };
