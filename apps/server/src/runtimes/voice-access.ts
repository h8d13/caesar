import {
  ChannelPermission,
  OWNER_ROLE_ID,
  Permission,
  ServerEvents
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

// The join-time rule (routers/voice/join.ts), for a user already in the
// room: global JOIN_VOICE_CHANNELS, plus VIEW_CHANNEL and JOIN on a private
// channel. Owners always pass.
const canStayInVoice = async (
  userId: number,
  channelId: number,
  isPrivate: boolean
): Promise<boolean> => {
  const roles = await getUserRoles(userId);

  if (roles.some((role) => role.id === OWNER_ROLE_ID)) return true;

  const hasGlobal = roles.some((role) =>
    role.permissions.includes(Permission.JOIN_VOICE_CHANNELS)
  );

  if (!hasGlobal) return false;
  if (!isPrivate) return true;

  const permissions = await getChannelPermissionsForUser(userId, channelId);

  return (
    permissions[ChannelPermission.VIEW_CHANNEL] &&
    permissions[ChannelPermission.JOIN]
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
const sweepVoiceAccess = async (): Promise<void> => {
  for (const runtime of VoiceRuntime.all()) {
    if (runtime.isDm) continue;

    const channel = await getChannelAccessRow(runtime.id);

    if (!channel) continue;

    for (const { userId } of runtime.getState().users) {
      if (await canStayInVoice(userId, runtime.id, channel.private)) continue;

      // left on their own during the awaits above
      if (!runtime.getUser(userId)) continue;

      await removeFromVoice(runtime, userId);

      logger.info(
        'Removed user %d from voice channel %d: access revoked',
        userId,
        runtime.id
      );
    }
  }
};

export { removeFromVoice, sweepVoiceAccess };
