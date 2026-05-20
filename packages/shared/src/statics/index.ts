export * from './metrics';
export * from './permissions';
export * from './storage';

export const DEFAULT_MESSAGES_LIMIT = 100;

export const OWNER_ROLE_ID = 1;

export const TYPING_MS = 300;

export enum DisconnectCode {
  UNEXPECTED = 1006,
  KICKED = 40000,
  BANNED = 40001,
  SERVER_SHUTDOWN = 40002,
  SESSION_SUPERSEDED = 40003,
  LOGGED_OUT = 40004
}

export const DELETED_USER_IDENTITY_AND_NAME = '__deleted_user__'; // this will be used as identity AND name, but in the interface we render as "Deleted"

export const DEFAULT_BITRATE = 6000; // kbps, screen share
export const DEFAULT_WEBCAM_BITRATE = 2500; // kbps, top simulcast/SVC layer
