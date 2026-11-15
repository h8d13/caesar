import type { TVoiceUserState } from './voice';

// Temp rooms: voice rooms outside the channel tree, joinable by anyone
// holding the link, account or not. Guests connect to their own WebSocket
// endpoint whose router only knows the room's voice procedures.

// path of the guest WebSocket endpoint
export const GUEST_WS_PATH = '/guest';
// URL fragment key (`#temp=<token>`): a fragment is never sent to the
// server, so the token stays out of access logs and Referer headers
export const TEMP_ROOM_HASH_PARAM = 'temp';

export const TEMP_ROOM_NAME_MAX_LENGTH = 48;
export const GUEST_NAME_MAX_LENGTH = 32;
export const TEMP_ROOM_MAX_PARTICIPANTS = 25;

export type TTempRoomParticipant = {
  id: number;
  name: string;
  isGuest: boolean;
};

export type TTempRoom = {
  id: number;
  name: string;
  creatorId: number;
  createdAt: number;
  expiresAt: number;
};

// a participant as a list of rooms shows it: with its mute / camera / screen
// state, like a user under a voice channel
export type TTempRoomListParticipant = TTempRoomParticipant & {
  state: TVoiceUserState;
};

// what the creator and MANAGE_TEMP_ROOMS holders get: the link token included
export type TTempRoomWithToken = TTempRoom & {
  token: string;
  participants: TTempRoomListParticipant[];
};

export type TTempRoomVoiceState = {
  users: { [userId: number]: TVoiceUserState };
  activeSince: number | null;
};
