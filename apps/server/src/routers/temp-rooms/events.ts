import { ChannelPermission, ServerEvents } from '@caesar/shared';
import { getTempRoomPermissions } from '@server/runtimes/temp-rooms';
import type { Events } from '@server/utils/pubsub';
import { protectedProcedure } from '@server/utils/trpc';
import { observable } from '@trpc/server/observable';

// Names of who is in a room go to who is in it, nobody else. Shared by the
// member router and the guest router.
const onTempRoomParticipantsRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    observable<Events[typeof ServerEvents.TEMP_ROOM_PARTICIPANTS]>(
      (observer) => {
        const sub = ctx.pubsub
          .subscribe(ServerEvents.TEMP_ROOM_PARTICIPANTS)
          .subscribe({
            next: (data) => {
              const permissions = getTempRoomPermissions(
                data.roomId,
                ctx.userId
              );

              if (permissions[ChannelPermission.VIEW_CHANNEL]) {
                observer.next(data);
              }
            }
          });

        return () => sub.unsubscribe();
      }
    )
);

// targeted at the room's creator, whose list of rooms it updates
const onTempRoomClosedRoute = protectedProcedure.subscription(async ({ ctx }) =>
  ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.TEMP_ROOM_CLOSED)
);

export { onTempRoomClosedRoute, onTempRoomParticipantsRoute };
