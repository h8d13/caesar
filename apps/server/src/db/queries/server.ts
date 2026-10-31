import type { TJoinedSettings, TPublicServerSettings } from '@caesar/shared';
import { files, settings } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { getVapidPublicKey } from '@server/utils/web-push';
import { eq, sql } from 'drizzle-orm';
import { db } from '..';
import { prepared } from '../prepared';

const settingsQuery = prepared(() => db.select().from(settings));
const fileByIdQuery = prepared(() =>
  db
    .select()
    .from(files)
    .where(eq(files.id, sql.placeholder('id')))
);

// since this is static, we can keep it in memory to avoid querying the DB every time
let token: string;

// Writers invalidate once committed: updateSettings (the row), removeFile
// (the logo row; its FK nulls settings.logoId) and user deletion (moves the
// logo's userId). Caching the promise means a read in flight across an
// invalidation resolves for its own awaiters only, never refilling it.
let settingsCache: Promise<Readonly<TJoinedSettings>> | undefined;

const readSettings = async (): Promise<Readonly<TJoinedSettings>> => {
  const serverSettings = await settingsQuery().get();
  if (!serverSettings) {
    throw new Error('Server settings row missing');
  }

  const logo = serverSettings.logoId
    ? await fileByIdQuery().get({ id: serverSettings.logoId })
    : undefined;

  // shared by every caller: freeze so a stray mutation throws instead of
  // leaking into the next request
  return Object.freeze({
    ...serverSettings,
    logo: logo ? Object.freeze(logo) : null
  });
};

const getSettings = (): Promise<Readonly<TJoinedSettings>> => {
  if (settingsCache) return settingsCache;

  const pending = readSettings();

  settingsCache = pending;
  // a failed read must not stick; the caller still gets the rejection
  pending.catch(() => {
    if (settingsCache === pending) settingsCache = undefined;
  });

  return pending;
};

const invalidateSettings = () => {
  settingsCache = undefined;
};

const getPublicSettings = async (): Promise<TPublicServerSettings> => {
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

export {
  getPublicSettings,
  getServerToken,
  getServerTokenSync,
  getSettings,
  invalidateSettings
};
