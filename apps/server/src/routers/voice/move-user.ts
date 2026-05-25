import {
  ChannelType,
  OWNER_ROLE_ID,
  Permission,
  ServerEvents
} from '@caesar/shared';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { getUserRoleIds } from '@server/db/queries/roles';
import { logger } from '@server/logger';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

// Moderator action: relocate another user to a different voice channel
// (the drag-and-drop target). Voice is client-driven, so we don't touch the
// target's transports here: we validate, then publish a targeted directive
// and the recipient's client re-runs its own join flow (which leaves the old
// channel and sets up the new one). ACL is enforced here, server-side — the
// UI gate is convenience only.
const moveUserRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      channelId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MOVE_MEMBERS);

    const destination = await getChannelByIdOrThrow(input.channelId);

    invariant(destination.type === ChannelType.VOICE && !destination.isDm, {
      code: 'BAD_REQUEST',
      message: 'Destination is not a voice channel'
    });

    const sourceRuntime = VoiceRuntime.findRuntimeByUserId(input.userId);

    invariant(sourceRuntime, {
      code: 'BAD_REQUEST',
      message: 'User is not in a voice channel'
    });

    // No-op if already there: avoids a needless leave/rejoin churn.
    if (sourceRuntime.id === input.channelId) return;

    // Owner protection: a non-owner moderator can't move the owner around.
    const targetRoleIds = await getUserRoleIds(input.userId);
    if (targetRoleIds.includes(OWNER_ROLE_ID)) {
      const actorRoleIds = await getUserRoleIds(ctx.userId);
      invariant(actorRoleIds.includes(OWNER_ROLE_ID), {
        code: 'FORBIDDEN',
        message: 'You cannot move the server owner.'
      });
    }

    ctx.pubsub.publishFor(input.userId, ServerEvents.VOICE_FORCE_MOVE, {
      channelId: input.channelId
    });

    logger.info(
      '%s moved user %s to voice channel %s',
      ctx.userId,
      input.userId,
      destination.name
    );
  });

export { moveUserRoute };
