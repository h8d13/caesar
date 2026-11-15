import { ChannelPermission, Permission, ServerEvents } from '@caesar/shared';
import { logger } from '@server/logger';
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

// A list of rooms went stale. Reaches exactly who tempRooms.list would show
// the room to: its creator and MANAGE_TEMP_ROOMS holders. Nobody else
// learns that a room exists, opened or closed.
const onTempRoomsChangedRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    observable<Events[typeof ServerEvents.TEMP_ROOMS_CHANGED]>((observer) => {
      const sub = ctx.pubsub
        .subscribe(ServerEvents.TEMP_ROOMS_CHANGED)
        .subscribe({
          next: (data) => {
            if (data.creatorId === ctx.userId) {
              observer.next(data);
              return;
            }

            // detached from any request: a rejected lookup must not become
            // an unhandled rejection, the event is dropped instead
            ctx
              .hasPermission(Permission.MANAGE_TEMP_ROOMS)
              .then((allowed) => {
                if (allowed) observer.next(data);
              })
              .catch((error) => {
                logger.error('[TempRooms] dropped a list update:', error);
              });
          }
        });

      return () => sub.unsubscribe();
    })
);

export { onTempRoomParticipantsRoute, onTempRoomsChangedRoute };
