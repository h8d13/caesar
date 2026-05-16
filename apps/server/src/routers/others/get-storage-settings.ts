import { Permission, type TStorageSettings } from '@caesar/shared';
import { getSettings } from '@server/db/queries/server';
import { getDiskMetrics } from '@server/utils/metrics';
import { protectedProcedure } from '@server/utils/trpc';

const getStorageSettingsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_STORAGE);

  const [settings, diskMetrics] = await Promise.all([
    getSettings(),
    getDiskMetrics()
  ]);

  const storageSettings: TStorageSettings = {
    storageUploadEnabled: settings.storageUploadEnabled,
    storageFileSharingInDirectMessages:
      settings.storageFileSharingInDirectMessages,
    storageQuota: settings.storageQuota,
    storageUploadMaxFileSize: settings.storageUploadMaxFileSize,
    storageMaxAvatarSize: settings.storageMaxAvatarSize,
    storageMaxBannerSize: settings.storageMaxBannerSize,
    storageMaxFilesPerMessage: settings.storageMaxFilesPerMessage,
    storageSpaceQuotaByUser: settings.storageSpaceQuotaByUser,
    storageOverflowAction: settings.storageOverflowAction
  };

  return { storageSettings, diskMetrics };
});

export { getStorageSettingsRoute };
