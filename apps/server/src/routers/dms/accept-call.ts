import { ServerEvents } from '@caesar/shared';
import { assertDmParticipant } from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { pendingCalls } from './call';

const acceptCallRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    await assertDmParticipant(input.channelId, ctx.userId);

    const call = pendingCalls.get(input.channelId);

    invariant(call != null, {
      code: 'BAD_REQUEST',
      message: 'No pending call for this DM'
    });

    invariant(call.peerId === ctx.userId, {
      code: 'BAD_REQUEST',
      message: 'Not the call recipient'
    });

    pendingCalls.delete(input.channelId);

    // Notify caller - both sides then independently call voice.join.
    ctx.pubsub.publishFor(call.callerId, ServerEvents.DM_CALL_ACCEPTED, {
      channelId: input.channelId
    });
  });

export { acceptCallRoute };
