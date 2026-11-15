import { Permission } from '@caesar/shared';
import {
  findTempRoomById,
  getTempRoomParticipants,
  getTempRoomVoiceState,
  toPublicTempRoom,
  type TTempRoomEntry
} from '@server/runtimes/temp-rooms';
import type { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import type { Context } from '@server/utils/trpc';

// one message for a wrong, expired and closed link: nothing to tell apart
const ROOM_NOT_FOUND = {
  code: 'NOT_FOUND',
  message: 'This room link is invalid or has expired'
} as const;

// Its creator and whoever moderates users may close a room or remove a
// guest from it.
const getManageableTempRoom = async (ctx: Context, roomId: number) => {
  const room = findTempRoomById(roomId);

  invariant(room, ROOM_NOT_FOUND);

  if (room.creatorId !== ctx.userId) {
    await ctx.needsPermission(Permission.MANAGE_USERS);
  }

  return room;
};

// what a client needs to render the room it just entered: members are not
// in a guest's store, guests are in nobody's
const getJoinedTempRoom = (room: TTempRoomEntry, runtime: VoiceRuntime) => ({
  room: toPublicTempRoom(room),
  routerRtpCapabilities: runtime.getRouter().rtpCapabilities,
  participants: getTempRoomParticipants(room),
  voice: getTempRoomVoiceState(room.id)
});

export { getJoinedTempRoom, getManageableTempRoom, ROOM_NOT_FOUND };
