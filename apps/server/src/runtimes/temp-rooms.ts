import {
  ServerEvents,
  TEMP_ROOM_MAX_PARTICIPANTS,
  type TChannelPermissionsMap,
  type TTempRoom,
  type TTempRoomListParticipant,
  type TTempRoomParticipant,
  type TTempRoomVoiceState
} from '@caesar/shared';
import { randomBytes } from 'crypto';
import type { WebSocket } from 'ws';
import { ALL_PERMISSIONS, NO_PERMISSIONS } from '../db/queries/channels';
import { pubsub } from '../utils/pubsub';
import { VoiceRuntime } from './voice';

// Temp rooms live in memory only, like the voice runtimes they wrap: a
// restart ends every call anyway. A room is a VoiceRuntime with a negative
// id (no channel row can collide with it) plus the link token and the
// names of whoever is in it. Guests are not users: they exist only here,
// under a negative id, for as long as their socket is in the room.

const TEMP_ROOM_TTL_MS = 12 * 60 * 60_000;
// a room nobody is in, e.g. between creating the link and people arriving
const TEMP_ROOM_EMPTY_GRACE_MS = 15 * 60_000;
const MAX_TEMP_ROOMS = 20;
const MAX_TEMP_ROOMS_PER_CREATOR = 3;

type TParticipant = {
  name: string;
  isGuest: boolean;
  // guests only: closing it is how a guest is removed
  ws?: WebSocket;
  ip?: string;
};

type TTempRoomEntry = TTempRoom & {
  token: string;
  // rechecked by the sweep: an empty room is closed once this is old
  emptySince: number | null;
  participants: Map<number, TParticipant>;
  // IPs of kicked guests, so the link they still hold stops working for them
  blockedIps: Set<string>;
};

const rooms = new Map<number, TTempRoomEntry>();
const roomsByToken = new Map<string, TTempRoomEntry>();

let nextRoomId = -1;
let nextGuestId = -1;

const allocateGuestId = () => nextGuestId--;

const isTempRoomId = (channelId: number) => rooms.has(channelId);

const findTempRoomById = (id: number) => rooms.get(id);

const findTempRoomByToken = (token: string) => roomsByToken.get(token);

const getAllTempRooms = () => [...rooms.values()];

const toPublicTempRoom = (room: TTempRoomEntry): TTempRoom => ({
  id: room.id,
  name: room.name,
  creatorId: room.creatorId,
  createdAt: room.createdAt,
  expiresAt: room.expiresAt
});

// The whole access rule of a temp room, for members and guests alike:
// whoever is in it may do everything a public voice channel allows, anyone
// else nothing, not even see who is there.
const getTempRoomPermissions = (
  roomId: number,
  userId: number
): TChannelPermissionsMap =>
  VoiceRuntime.findById(roomId)?.getUser(userId)
    ? ALL_PERMISSIONS
    : NO_PERMISSIONS;

const createTempRoom = async (
  creatorId: number,
  name: string
): Promise<TTempRoomEntry | 'limit'> => {
  let ownRooms = 0;

  for (const room of rooms.values()) {
    if (room.creatorId === creatorId) ownRooms++;
  }

  if (rooms.size >= MAX_TEMP_ROOMS || ownRooms >= MAX_TEMP_ROOMS_PER_CREATOR) {
    return 'limit';
  }

  const now = Date.now();
  const room: TTempRoomEntry = {
    id: nextRoomId--,
    name,
    creatorId,
    createdAt: now,
    expiresAt: now + TEMP_ROOM_TTL_MS,
    // 256 bits: the link is the only thing between a stranger and the room
    token: randomBytes(32).toString('base64url'),
    emptySince: now,
    participants: new Map(),
    blockedIps: new Set()
  };

  const runtime = new VoiceRuntime(room.id, false, true);

  await runtime.init();

  rooms.set(room.id, room);
  roomsByToken.set(room.token, room);
  publishTempRoomsChanged(room);

  return room;
};

const getTempRoomParticipants = (
  room: TTempRoomEntry
): TTempRoomParticipant[] =>
  [...room.participants].map(([id, { name, isGuest }]) => ({
    id,
    name,
    isGuest
  }));

const getTempRoomListParticipants = (
  room: TTempRoomEntry
): TTempRoomListParticipant[] => {
  const runtime = VoiceRuntime.findById(room.id);

  return getTempRoomParticipants(room).flatMap((participant) =>
    runtime
      ? [{ ...participant, state: runtime.getUserState(participant.id) }]
      : []
  );
};

const getTempRoomVoiceState = (roomId: number): TTempRoomVoiceState => {
  const users: TTempRoomVoiceState['users'] = {};
  const state = VoiceRuntime.findById(roomId)?.getState();

  for (const user of state?.users ?? []) {
    users[user.userId] = user.state;
  }

  return { users, activeSince: state?.activeSince ?? null };
};

// For the lists of rooms: no content, the receivers refetch what they are
// allowed to see. Sent on every change a list shows (opened, closed, who
// is in it).
const publishTempRoomsChanged = (room: TTempRoomEntry) => {
  pubsub.publish(ServerEvents.TEMP_ROOMS_CHANGED, {
    creatorId: room.creatorId
  });
};

// a participant muted, turned a camera on, ...: the lists show that too
const notifyTempRoomChanged = (roomId: number) => {
  const room = rooms.get(roomId);

  if (room) publishTempRoomsChanged(room);
};

const publishTempRoomParticipants = (room: TTempRoomEntry) => {
  pubsub.publish(ServerEvents.TEMP_ROOM_PARTICIPANTS, {
    roomId: room.id,
    participants: getTempRoomParticipants(room)
  });
  publishTempRoomsChanged(room);
};

const isTempRoomFull = (room: TTempRoomEntry) =>
  room.participants.size >= TEMP_ROOM_MAX_PARTICIPANTS;

// Puts a member or a guest in the room and tells it. The names go out
// before the voice join, so nobody renders a participant they cannot name.
const addTempRoomParticipant = (
  room: TTempRoomEntry,
  userId: number,
  participant: TParticipant,
  state: { micMuted: boolean; soundMuted: boolean }
) => {
  const runtime = VoiceRuntime.findById(room.id);

  if (!runtime) return;

  room.participants.set(userId, participant);
  room.emptySince = null;
  runtime.addUser(userId, state);

  publishTempRoomParticipants(room);

  pubsub.publish(ServerEvents.USER_JOIN_VOICE, {
    channelId: room.id,
    userId,
    state: runtime.getUserState(userId)
  });
  pubsub.publish(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, {
    channelId: room.id,
    activeSince: runtime.getState().activeSince
  });

  return runtime;
};

// called by removeFromVoice, the one path out of any voice room
const forgetTempRoomParticipant = (roomId: number, userId: number) => {
  const room = rooms.get(roomId);

  if (!room?.participants.delete(userId)) return;

  if (room.participants.size === 0) room.emptySince = Date.now();

  publishTempRoomParticipants(room);
};

const deleteTempRoom = (room: TTempRoomEntry) => {
  rooms.delete(room.id);
  roomsByToken.delete(room.token);
  publishTempRoomsChanged(room);
};

export {
  addTempRoomParticipant,
  allocateGuestId,
  createTempRoom,
  deleteTempRoom,
  findTempRoomById,
  findTempRoomByToken,
  forgetTempRoomParticipant,
  getAllTempRooms,
  getTempRoomListParticipants,
  getTempRoomParticipants,
  getTempRoomPermissions,
  getTempRoomVoiceState,
  isTempRoomFull,
  isTempRoomId,
  notifyTempRoomChanged,
  TEMP_ROOM_EMPTY_GRACE_MS,
  toPublicTempRoom
};
export type { TTempRoomEntry };
