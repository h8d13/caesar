export * from './metrics';
export * from './permissions';
export * from './storage';

export const DEFAULT_MESSAGES_LIMIT = 50;

// Unread badges show exact counts up to this, then "<max>+". The server
// stops counting at max + 1, which is all the badge can tell apart.
export const UNREAD_COUNT_MAX = 99;

// Sized for E2EE: ciphertext is base64 (~1.37x the HTML it encrypts).
export const MESSAGE_MAX_LENGTH = 32_000;

export const REACTION_EMOJI_MAX_LENGTH = 64;

export const OWNER_ROLE_ID = 1;

export const TYPING_MS = 300;

// Must fall in the application range 4000-4999 per RFC 6455.
export enum DisconnectCode {
  KICKED = 4000,
  BANNED = 4001,
  SESSION_SUPERSEDED = 4003,
  LOGGED_OUT = 4004
}

export const DELETED_USER_IDENTITY_AND_NAME = '__deleted_user__'; // this will be used as identity AND name, but in the interface we render as "Deleted"

export const DEFAULT_BITRATE = 6000; // kbps, screen share
export const DEFAULT_WEBCAM_BITRATE = 2500; // kbps, top simulcast/SVC layer

// Password KDF, run client-side: priv = argon2id(password, sha256(identity))
// is the E2EE key, and authKey = HKDF-SHA256(priv, AUTH_KEY_INFO) is what
// /login and updatePassword receive instead of the password. The server
// re-derives it only for temporary passwords it generates, so both sides
// must use the same parameters. m is in KiB.
export const PASSWORD_KDF = { t: 3, m: 64 * 1024, p: 1, dkLen: 32 } as const;
// test suites only: correctness, not strength
export const PASSWORD_KDF_TEST = { t: 1, m: 256, p: 1, dkLen: 32 } as const;
export const AUTH_KEY_INFO = 'caesar-auth-v1';
// 32 bytes (authKey, E2EE wrap key), base64 with padding
export const BASE64_32_BYTES_REGEX = /^[A-Za-z0-9+/]{43}=$/;

// enforced client-side: the server only ever sees the authKey
export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_LENGTH_ERROR = `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`;
