import { ActivityLogType, ServerEvents, UserStatus } from '@caesar/shared';
import { categories, users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  getAllChannelUserPermissions,
  getChannelsForUser,
  getChannelsReadStatesForUser
} from '@server/db/queries/channels';
import { getEmojis } from '@server/db/queries/emojis';
import { getRoles } from '@server/db/queries/roles';
import { getPublicSettings, getSettings } from '@server/db/queries/server';
import { getSounds } from '@server/db/queries/sounds';
import { getPublicUsers } from '@server/db/queries/users';
import { logger } from '@server/logger';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { enqueueLogin } from '@server/queues/logins';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { rateLimitedProcedure, t } from '@server/utils/trpc';
import { trackUserConnect } from '@server/utils/wss';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const joinServerRoute = rateLimitedProcedure(t.procedure, {
  maxRequests: 5,
  windowMs: 60_000,
  logLabel: 'joinServer'
})
  .input(
    z.object({
      handshakeHash: z.string()
    })
  )
  .query(async ({ input, ctx }) => {
    const connectionInfo = ctx.getConnectionInfo();
    const settings = await getSettings();

    invariant(
      input.handshakeHash &&
        ctx.handshakeHash &&
        input.handshakeHash === ctx.handshakeHash,
      {
        code: 'FORBIDDEN',
        message: 'Invalid handshake hash'
      }
    );

    invariant(ctx.user, {
      code: 'UNAUTHORIZED',
      message: 'User not authenticated'
    });

    ctx.authenticated = true;
    ctx.setWsUserId(ctx.user.id);
    trackUserConnect(ctx.user.id);

    const [
      allCategories,
      channelsForUser,
      publicUsers,
      roles,
      emojis,
      sounds,
      channelPermissions,
      readStates,
      publicSettings
    ] = await Promise.all([
      db.select().from(categories),
      getChannelsForUser(ctx.user.id), // filter channels based on permissions and DM participation
      getPublicUsers(),
      getRoles(),
      getEmojis(),
      getSounds(),
      getAllChannelUserPermissions(ctx.user.id),
      getChannelsReadStatesForUser(ctx.user.id),
      getPublicSettings()
    ]);

    // statuses are computed from the joiner's POV:
    // - the joiner's own row keeps the real connection status mask: when
    //   appearOffline is true, status is OFFLINE for everyone (including
    //   self) so the UI matches what peers see. the `appearOffline` flag
    //   itself is kept only on the self row so the eye toggle reflects
    //   truth.
    // - peers see masked status when their `appearOffline` is true, and
    //   the flag itself is stripped so it never leaves the server.
    const processedPublicUsers = publicUsers.map((u) => {
      const isSelf = u.id === ctx.user.id;
      const realStatus = ctx.getStatusById(u.id);
      const status = u.appearOffline ? UserStatus.OFFLINE : realStatus;

      return {
        ...u,
        status,
        appearOffline: isSelf ? u.appearOffline : undefined,
        allowMultipleSessions: isSelf ? u.allowMultipleSessions : undefined
      };
    });

    const foundPublicUser = processedPublicUsers.find(
      (u) => u.id === ctx.user.id
    );

    invariant(foundPublicUser, {
      code: 'NOT_FOUND',
      message: 'User not present in public users'
    });

    logger.info(`%s joined the server`, ctx.user.name);

    // broadcast to peers with the masked status and without self-only flags.
    const {
      appearOffline: ownAppearOffline,
      allowMultipleSessions: _ownMultiSession,
      ...broadcastBase
    } = foundPublicUser;
    void _ownMultiSession;

    ctx.pubsub.publish(ServerEvents.USER_JOIN, {
      ...broadcastBase,
      status: ownAppearOffline ? UserStatus.OFFLINE : UserStatus.ONLINE
    });

    if (connectionInfo?.ip) {
      ctx.saveUserIp(ctx.user.id, connectionInfo.ip);
    }

    const voiceMap = VoiceRuntime.getVoiceMap();
    const externalStreamsMap = VoiceRuntime.getExternalStreamsMap();

    await db
      .update(users)
      .set({ lastLoginAt: Date.now() })
      .where(eq(users.id, ctx.user.id));

    enqueueLogin(ctx.user.id, connectionInfo);
    enqueueActivityLog({
      type: ActivityLogType.USER_JOINED,
      userId: ctx.user.id,
      ip: connectionInfo?.ip
    });

    return {
      categories: allCategories,
      channels: channelsForUser,
      users: processedPublicUsers,
      serverId: settings.serverId,
      serverName: settings.name,
      ownUserId: ctx.user.id,
      voiceMap,
      roles,
      emojis,
      sounds,
      publicSettings,
      channelPermissions,
      readStates,
      externalStreamsMap
    };
  });

export { joinServerRoute };
