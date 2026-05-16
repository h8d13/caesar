import { ActivityLogType, ServerEvents, UserStatus } from '@caesar/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
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
import { categories, users } from '@server/db/schema';
import { logger } from '@server/logger';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { enqueueLogin } from '@server/queues/logins';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { rateLimitedProcedure, t } from '@server/utils/trpc';
import { trackUserConnect } from '@server/utils/wss';

const joinServerRoute = rateLimitedProcedure(t.procedure, {
  maxRequests: 5,
  windowMs: 60_000,
  logLabel: 'joinServer'
})
  .input(
    z.object({
      handshakeHash: z.string(),
      password: z.string().optional()
    })
  )
  .query(async ({ input, ctx }) => {
    const connectionInfo = ctx.getConnectionInfo();
    const settings = await getSettings();
    const hasPassword = !!settings?.password;

    invariant(
      input.handshakeHash &&
        ctx.handshakeHash &&
        input.handshakeHash === ctx.handshakeHash,
      {
        code: 'FORBIDDEN',
        message: 'Invalid handshake hash'
      }
    );

    invariant(hasPassword ? input.password === settings?.password : true, {
      code: 'FORBIDDEN',
      message: 'Invalid password'
    });

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
      getPublicUsers(true), // return identity to get status of already connected users
      getRoles(),
      getEmojis(),
      getSounds(),
      getAllChannelUserPermissions(ctx.user.id),
      getChannelsReadStatesForUser(ctx.user.id),
      getPublicSettings()
    ]);

    const processedPublicUsers = publicUsers.map((u) => ({
      ...u,
      status: ctx.getStatusById(u.id),
      _identity: undefined // remove identity before sending to client
    }));

    const foundPublicUser = processedPublicUsers.find(
      (u) => u.id === ctx.user.id
    );

    invariant(foundPublicUser, {
      code: 'NOT_FOUND',
      message: 'User not present in public users'
    });

    logger.info(`%s joined the server`, ctx.user.name);

    ctx.pubsub.publish(ServerEvents.USER_JOIN, {
      ...foundPublicUser,
      status: UserStatus.ONLINE
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
