import { Permission, type TTempRoomWithToken } from '@caesar/shared';
import {
  getAllTempRooms,
  getTempRoomListParticipants,
  toPublicTempRoom
} from '@server/runtimes/temp-rooms';
import { protectedProcedure } from '@server/utils/trpc';

// The rooms the caller may manage: their own, or all of them with
// MANAGE_TEMP_ROOMS. The token comes with it, so the link can be copied
// again and a moderator can look into a room.
const listTempRoomsRoute = protectedProcedure.query(
  async ({ ctx }): Promise<TTempRoomWithToken[]> => {
    const seesAll = await ctx.hasPermission(Permission.MANAGE_TEMP_ROOMS);

    return getAllTempRooms()
      .filter((room) => seesAll || room.creatorId === ctx.userId)
      .map((room) => ({
        ...toPublicTempRoom(room),
        token: room.token,
        participants: getTempRoomListParticipants(room)
      }));
  }
);

export { listTempRoomsRoute };
