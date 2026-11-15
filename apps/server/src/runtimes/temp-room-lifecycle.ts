import { DisconnectCode, OWNER_ROLE_ID, Permission } from '@caesar/shared';
import { getUserById } from '../db/queries/users';
import { closeSocket } from '../helpers/close-reason';
import { logger } from '../logger';
import { getUserRoles } from '../routers/users/get-user-roles';
import {
  deleteTempRoom,
  getAllTempRooms,
  TEMP_ROOM_EMPTY_GRACE_MS,
  type TTempRoomEntry
} from './temp-rooms';
import { VoiceRuntime } from './voice';
import { removeFromVoice } from './voice-access';

const SWEEP_INTERVAL_MS = 30_000;

// Ends a room: everyone leaves through removeFromVoice (members learn it
// from their own leave event), guest sockets are closed since the room was
// all they had, and the link stops resolving.
const closeTempRoom = async (room: TTempRoomEntry, reason: string) => {
  // first, so nobody joins a room that is being emptied
  deleteTempRoom(room);

  const runtime = VoiceRuntime.findById(room.id);
  const guestSockets = [...room.participants.values()].flatMap((p) =>
    p.ws ? [p.ws] : []
  );

  if (runtime) {
    // removeUser replaces the list, it does not shrink the one iterated
    for (const { userId } of runtime.getState().users) {
      await removeFromVoice(runtime, userId);
    }

    runtime.destroy();
  }

  for (const ws of guestSockets) {
    closeSocket(ws, DisconnectCode.TEMP_ROOM_CLOSED, 'This room was closed');
  }

  logger.info('Temp room %d (%s) closed: %s', room.id, room.name, reason);
};

// Takes one guest out and closes their socket.
const kickTempRoomGuest = async (room: TTempRoomEntry, guestId: number) => {
  const guest = room.participants.get(guestId);

  if (!guest?.isGuest) return false;

  if (guest.ip) room.blockedIps.add(guest.ip);

  const runtime = VoiceRuntime.findById(room.id);

  if (runtime) await removeFromVoice(runtime, guestId);

  if (guest.ws) {
    closeSocket(guest.ws, DisconnectCode.KICKED, 'Removed from the room');
  }

  return true;
};

// A room outlives nothing it depends on: its expiry, people being in it,
// and its creator still being allowed to hold one (a banned or demoted
// creator must not leave an open door behind).
const canStillHostTempRoom = async (creatorId: number) => {
  const creator = await getUserById(creatorId);

  if (!creator || creator.banned) return false;

  const roles = await getUserRoles(creatorId);

  return roles.some(
    (role) =>
      role.id === OWNER_ROLE_ID ||
      role.permissions.includes(Permission.CREATE_TEMP_ROOMS)
  );
};

const sweepTempRooms = async () => {
  const now = Date.now();

  for (const room of getAllTempRooms()) {
    if (now >= room.expiresAt) {
      await closeTempRoom(room, 'expired');
    } else if (
      room.emptySince !== null &&
      now - room.emptySince >= TEMP_ROOM_EMPTY_GRACE_MS
    ) {
      await closeTempRoom(room, 'empty');
    } else if (!(await canStillHostTempRoom(room.creatorId))) {
      await closeTempRoom(room, 'creator lost access');
    }
  }
};

const startTempRoomSweep = () => {
  setInterval(() => {
    // detached from any request: a rejection would exit the process
    sweepTempRooms().catch((error) => {
      logger.error('[TempRooms] sweep failed:', error);
    });
  }, SWEEP_INTERVAL_MS).unref();
};

export { closeTempRoom, kickTempRoomGuest, startTempRoomSweep, sweepTempRooms };
