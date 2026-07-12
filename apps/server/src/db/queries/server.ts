import type { TJoinedSettings, TPublicServerSettings } from '@caesar/shared';
import { files, settings } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { getVapidPublicKey } from '@server/utils/web-push';
import { eq } from 'drizzle-orm';
import { db } from '..';

// since this is static, we can keep it in memory to avoid querying the DB every time
let token: string;

const getSettings = async (): Promise<TJoinedSettings> => {
  // The `!` was previously on the awaited value; with libsql's stricter
  // return types (T | undefined), the postfix-! pre-await did nothing.
  // settings row is always present after seed; assert after await.
  const serverSettings = await db.select().from(settings).get();
  if (!serverSettings) {
    throw new Error('Server settings row missing');
  }

  const logo = serverSettings.logoId
    ? await db
        .select()
        .from(files)
        .where(eq(files.id, serverSettings.logoId))
        .get()
    : undefined;

  return {
    ...serverSettings,
    logo: logo ?? null
  };
};

const getPublicSettings: () => Promise<TPublicServerSettings> = async () => {
  const settings = await getSettings();

  const publicSettings: TPublicServerSettings = {
    description: settings.description ?? '',
    name: settings.name,
    serverId: settings.serverId,
    storageUploadEnabled: settings.storageUploadEnabled,
    directMessagesEnabled: settings.directMessagesEnabled,
    gamesEnabled: settings.gamesEnabled,
    storageQuota: settings.storageQuota,
    storageUploadMaxFileSize: settings.storageUploadMaxFileSize,
    storageFileSharingInDirectMessages:
      settings.storageFileSharingInDirectMessages,
    storageMaxAvatarSize: settings.storageMaxAvatarSize,
    storageMaxBannerSize: settings.storageMaxBannerSize,
    storageMaxFilesPerMessage: settings.storageMaxFilesPerMessage,
    storageSpaceQuotaByUser: settings.storageSpaceQuotaByUser,
    storageOverflowAction: settings.storageOverflowAction,
    webRtcMaxBitrate: config.webRtc.maxBitrate,
    vapidPublicKey: await getVapidPublicKey()
  };

  return publicSettings;
};

const getServerTokenSync = (): string => {
  if (!token) {
    throw new Error('Server token has not been initialized yet');
  }

  return token;
};

const getServerToken = async (): Promise<string> => {
  if (token) return token;

  const { secretToken } = await getSettings();

  if (!secretToken) {
    throw new Error('Secret token not found in database settings');
  }

  token = secretToken;

  return token;
};

export { getPublicSettings, getServerToken, getServerTokenSync, getSettings };
