import { ServerEvents } from '@caesar/shared';
import { messageFiles, messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

const wipeConversationRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const isDm = await isDirectMessageChannel(input.channelId);

    invariant(isDm, {
      code: 'BAD_REQUEST',
      message: 'wipeConversation only applies to DM channels'
    });

    await assertDmParticipant(input.channelId, ctx.userId);

    // gather attached file ids before deleting messages: removeFile cleans
    // both the row and the on-disk artifact. messageFiles/messageReactions
    // are cascade-deleted via the messages.id FK.
    const messageIds = (
      await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.channelId, input.channelId))
    ).map((r) => r.id);

    if (messageIds.length > 0) {
      const fileIds = (
        await db
          .select({ fileId: messageFiles.fileId })
          .from(messageFiles)
          .where(inArray(messageFiles.messageId, messageIds))
      ).map((r) => r.fileId);

      const uniqueFileIds = Array.from(new Set(fileIds));

      await Promise.all(uniqueFileIds.map((fileId) => removeFile(fileId)));

      await db.delete(messages).where(eq(messages.channelId, input.channelId));
    }

    const participants = await getDirectMessageChannelParticipantIds(
      input.channelId
    );

    ctx.pubsub.publishFor(participants, ServerEvents.DM_WIPED, {
      channelId: input.channelId
    });
  });

export { wipeConversationRoute };
