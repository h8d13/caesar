import { ChannelPermission, isEmptyMessage, Permission } from '@caesar/shared';
import { messageFiles, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishMessage } from '@server/db/publishers';
import {
  assertDmChannel,
  getDmEphemeralMs,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { getSettings } from '@server/db/queries/server';
import { sanitizeMessageHtml } from '@server/helpers/sanitize-html';
import { enqueueProcessMetadata } from '@server/queues/message-metadata';
import { fileManager } from '@server/utils/file-manager';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const sendMessageRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.sendAndEditMessage.maxRequests,
  windowMs: config.rateLimiters.sendAndEditMessage.windowMs,
  logLabel: 'sendMessage'
})
  .input(
    z.object({
      content: z.string(),
      channelId: z.number(),
      files: z.array(z.string()).default([]),
      replyToMessageId: z.number().optional(),
      // E2EE marker. true => content is base64 AES-GCM ciphertext, MUST
      // skip HTML sanitization, and channel MUST currently be ephemeral.
      isEncrypted: z.boolean().optional().default(false)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await Promise.all([
      ctx.needsPermission(Permission.SEND_MESSAGES),
      ctx.needsChannelPermission(
        input.channelId,
        ChannelPermission.SEND_MESSAGES
      )
    ]);

    if (input.replyToMessageId) {
      const replyToMessage = await db
        .select({
          id: messages.id,
          channelId: messages.channelId
        })
        .from(messages)
        .where(eq(messages.id, input.replyToMessageId))
        .limit(1)
        .get();

      invariant(replyToMessage, {
        code: 'NOT_FOUND',
        message: 'Reply target message not found.'
      });

      invariant(replyToMessage.channelId === input.channelId, {
        code: 'BAD_REQUEST',
        message: 'Reply target message must be in the same channel.'
      });
    }

    const [settings, isDmChannel] = await Promise.all([
      getSettings(),
      isDirectMessageChannel(input.channelId),
      assertDmChannel(input.channelId, ctx.userId)
    ]);

    if (isDmChannel) {
      invariant(await ctx.hasPermission(Permission.USE_DMS), {
        code: 'FORBIDDEN',
        message: 'You do not have permission to use direct messages'
      });
    }

    const { storageMaxFilesPerMessage } = settings;

    const limitedFiles = input.files.slice(
      0,
      Math.max(0, storageMaxFilesPerMessage)
    );

    if (limitedFiles.length > 0) {
      invariant(settings.storageUploadEnabled, {
        code: 'FORBIDDEN',
        message: 'File uploads are disabled on this server'
      });

      if (isDmChannel) {
        invariant(settings.storageFileSharingInDirectMessages, {
          code: 'FORBIDDEN',
          message: 'File sharing in direct messages is disabled on this server'
        });
      }
    }

    invariant(!isEmptyMessage(input.content) || limitedFiles.length != 0, {
      code: 'BAD_REQUEST',
      message: 'Message cannot be empty.'
    });

    const now = Date.now();
    const ephemeralMs = isDmChannel
      ? await getDmEphemeralMs(input.channelId)
      : null;

    // E2EE invariant: encryption flag must match the channel's current
    // ephemeral state. Either both true or both false. Prevents a stale
    // client cache from sending ciphertext to a non-ephemeral channel
    // (where it would render as raw base64) or plaintext to an ephemeral
    // channel (where it would defeat the purpose).
    invariant(input.isEncrypted === (ephemeralMs !== null), {
      code: 'BAD_REQUEST',
      message:
        'Ephemeral state changed. Refresh and resend (the toggle was changed mid-send).'
    });

    // Ciphertext is opaque base64 sanitization would only corrupt it.
    // Plaintext goes through the normal HTML sanitizer.
    const targetContent = input.isEncrypted
      ? input.content
      : sanitizeMessageHtml(input.content);

    invariant(!isEmptyMessage(targetContent) || limitedFiles.length != 0, {
      code: 'BAD_REQUEST',
      message:
        'Your message only contained unsupported or removed content, so there was nothing to send.'
    });

    const message = await db
      .insert(messages)
      .values({
        channelId: input.channelId,
        userId: ctx.userId,
        content: targetContent,
        replyToMessageId: input.replyToMessageId ?? null,
        expiresAt: ephemeralMs ? now + ephemeralMs : null,
        createdAt: now
      })
      .returning()
      .get();

    if (limitedFiles.length > 0) {
      for (const tempFileId of limitedFiles) {
        const newFile = await fileManager.saveFile(tempFileId, ctx.userId);

        await db.insert(messageFiles).values({
          messageId: message.id,
          fileId: newFile.id,
          createdAt: Date.now()
        });
      }
    }

    void publishMessage(message.id, input.channelId, 'create');

    enqueueProcessMetadata(targetContent, message.id);

    return message.id;
  });

export { sendMessageRoute };
