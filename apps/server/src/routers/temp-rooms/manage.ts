import {
  closeTempRoom,
  kickTempRoomGuest
} from '@server/runtimes/temp-room-lifecycle';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { getManageableTempRoom } from './access';

const closeTempRoomRoute = protectedProcedure
  .input(z.object({ roomId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const room = await getManageableTempRoom(ctx, input.roomId);

    await closeTempRoom(room, `closed by ${ctx.user.name}`);
  });

// Guests only: a member is moderated like anywhere else (kick, ban, roles).
// The guest's IP is refused by this room afterwards.
const kickTempRoomGuestRoute = protectedProcedure
  .input(z.object({ roomId: z.number(), guestId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const room = await getManageableTempRoom(ctx, input.roomId);

    invariant(await kickTempRoomGuest(room, input.guestId), {
      code: 'NOT_FOUND',
      message: 'Guest not found in this room'
    });
  });

export { closeTempRoomRoute, kickTempRoomGuestRoute };
