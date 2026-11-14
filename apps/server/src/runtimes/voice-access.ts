import {
  ChannelPermission,
  OWNER_ROLE_ID,
  Permission,
  ServerEvents,
  StreamKind,
  type TChannelPermissionsMap
} from '@caesar/shared';
import {
  getChannelAccessRow,
  getChannelPermissionsForUser
} from '@server/db/queries/channels';
import { getDirectMessageChannelParticipantIds } from '@server/db/queries/dms';
import { logger } from '@server/logger';
import { getUserRoles } from '@server/routers/users/get-user-roles';
import { pubsub } from '@server/utils/pubsub';
import { VoiceRuntime } from './voice';

// The socket that joined each user's call. A user may hold several
// sessions, and only this one can leave the call: when it closes while the
// others stay open, nothing else would ever take the user out of the room.
// Keyed by user and overwritten on every join (a user is in one room at a
// time), so a socket that left or was swept never holds a stale claim.
const voiceSockets = new Map<number, object>();

const markVoiceSocket = (userId: number, ws: object) => {
  voiceSockets.set(userId, ws);
};

const isVoiceSocket = (userId: number, ws: object) =>
  voiceSockets.get(userId) === ws;

// The join-time rule (routers/voice/join.ts), for a user already in the
// room: global JOIN_VOICE_CHANNELS, plus VIEW_CHANNEL and JOIN on a private
// channel. Owners always pass. Returns 'leave' when the rule fails, 'all'
// when no channel permission applies (owner, public channel), otherwise
// the user's permissions in the private channel.
const getVoiceAccess = async (
  userId: number,
  channelId: number,
  isPrivate: boolean
): Promise<TChannelPermissionsMap | 'all' | 'leave'> => {
  const roles = await getUserRoles(userId);

  if (roles.some((role) => role.id === OWNER_ROLE_ID)) return 'all';

  const hasGlobal = roles.some((role) =>
    role.permissions.includes(Permission.JOIN_VOICE_CHANNELS)
  );

  if (!hasGlobal) return 'leave';
  if (!isPrivate) return 'all';

  const permissions = await getChannelPermissionsForUser(userId, channelId);

  return permissions[ChannelPermission.VIEW_CHANNEL] &&
    permissions[ChannelPermission.JOIN]
    ? permissions
    : 'leave';
};

// What produce (routers/voice/produce.ts) checks before a camera or a
// screen share starts, for one that is already running.
const REVOCABLE_STREAMS = [
  {
    permission: ChannelPermission.WEBCAM,
    kinds: [StreamKind.VIDEO],
    flag: 'webcamEnabled'
  },
  {
    permission: ChannelPermission.SHARE_SCREEN,
    kinds: [StreamKind.SCREEN, StreamKind.SCREEN_AUDIO],
    flag: 'sharingScreen'
  }
] as const;

// The mic is paused rather than closed: the client keeps one audio producer
// for the whole call, so a closed one would leave nothing to unmute into
// once SPEAK comes back. Nothing else pauses a producer on the server, so
// paused always means "SPEAK was revoked". The user is shown muted, and
// stays muted after a re-grant until they unmute themselves. Returns
// whether the user's state changed.
const syncMic = async (
  runtime: VoiceRuntime,
  userId: number,
  canSpeak: boolean
): Promise<boolean> => {
  const producer = runtime.getProducer(StreamKind.AUDIO, userId);

  if (canSpeak) {
    if (producer?.paused) await producer.resume();

    return false;
  }

  if (producer && !producer.paused) await producer.pause();

  if (runtime.getUserState(userId).micMuted) return false;

  runtime.updateUserState(userId, { micMuted: true });

  return true;
};

// produce is the only place a stream's permission was checked, so a mic,
// camera or screen share kept running after SPEAK / WEBCAM / SHARE_SCREEN
// was taken away. The producer id lets the owner's client tell this close
// from the echo of one it started itself. 'all': owner or public channel.
const applyStreamPermissions = async (
  runtime: VoiceRuntime,
  userId: number,
  permissions: TChannelPermissionsMap | 'all'
) => {
  if (permissions === 'all') {
    await syncMic(runtime, userId, true);

    return;
  }

  let changed = await syncMic(
    runtime,
    userId,
    permissions[ChannelPermission.SPEAK]
  );

  for (const { permission, kinds, flag } of REVOCABLE_STREAMS) {
    if (permissions[permission]) continue;

    for (const kind of kinds) {
      const producer = runtime.getProducer(kind, userId);

      if (!producer) continue;

      runtime.removeProducer(userId, kind);
      changed = true;

      pubsub.publishForChannel(runtime.id, ServerEvents.VOICE_PRODUCER_CLOSED, {
        channelId: runtime.id,
        remoteId: userId,
        kind,
        producerId: producer.id
      });
    }

    if (runtime.getUserState(userId)[flag]) {
      runtime.updateUserState(userId, { [flag]: false });
      changed = true;
    }
  }

  if (!changed) return;

  pubsub.publish(ServerEvents.USER_VOICE_STATE_UPDATE, {
    channelId: runtime.id,
    userId,
    state: runtime.getUserState(userId)
  });

  logger.info(
    'Restricted streams of user %d in voice channel %d: permission revoked',
    userId,
    runtime.id
  );
};

// Takes a user out of a room and tells everyone who needs to know. The one
// path for it (leaving, disconnecting, losing access), so none of them can
// forget a step: a DM call ended by a dropped connection used to leave its
// runtime behind and the peer's call overlay open.
const removeFromVoice = async (
  runtime: VoiceRuntime,
  userId: number
): Promise<void> => {
  runtime.removeUser(userId);
  voiceSockets.delete(userId);

  const { users, activeSince } = runtime.getState();

  pubsub.publish(ServerEvents.USER_LEAVE_VOICE, {
    channelId: runtime.id,
    userId
  });
  pubsub.publish(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, {
    channelId: runtime.id,
    activeSince
  });

  if (!runtime.isDm) return;

  const participants = await getDirectMessageChannelParticipantIds(runtime.id);
  const peerId = participants.find((id) => id !== userId);

  if (peerId != null) {
    pubsub.publishFor(peerId, ServerEvents.DM_CALL_ENDED, {
      channelId: runtime.id
    });
  }

  // a DM runtime only exists for the length of a call
  if (users.length === 0) runtime.destroy();
};

// Join is the only place access to a voice channel was checked, so a user
// kept hearing a room after losing it (channel made private, grant or role
// removed). Called after every change that can take access away: removes
// whoever no longer passes the join rule. DM calls are participation-only
// and never change, so they are skipped. Rooms are few and small: one pass
// over everyone in voice is cheaper than tracking who a change touched.
// Whoever stays loses the streams they may no longer send, and gets a mic
// paused by an earlier revocation back.
const sweepVoiceAccess = async (): Promise<void> => {
  for (const runtime of VoiceRuntime.all()) {
    if (runtime.isDm) continue;

    const channel = await getChannelAccessRow(runtime.id);

    if (!channel) continue;

    for (const { userId } of runtime.getState().users) {
      const access = await getVoiceAccess(userId, runtime.id, channel.private);

      // left on their own during the awaits above
      if (!runtime.getUser(userId)) continue;

      if (access !== 'leave') {
        await applyStreamPermissions(runtime, userId, access);

        continue;
      }

      await removeFromVoice(runtime, userId);

      logger.info(
        'Removed user %d from voice channel %d: access revoked',
        userId,
        runtime.id
      );
    }
  }
};

export { isVoiceSocket, markVoiceSocket, removeFromVoice, sweepVoiceAccess };
