import {
  ActivityLogType,
  Permission,
  StorageOverflowAction
} from '@caesar/shared';
import { updateSettings } from '@server/db/mutations/server';
import { publishSettings } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const updateSettingsRoute = protectedProcedure
  .input(
    z.object({
      name: z.string().min(2).max(24).optional(),
      description: z.string().max(128).optional(),
      password: z.string().min(1).max(32).optional().nullable().default(null),
      directMessagesEnabled: z.boolean().optional(),
      storageUploadEnabled: z.boolean().optional(),
      storageFileSharingInDirectMessages: z.boolean().optional(),
      storageQuota: z.number().min(0).optional(),
      storageUploadMaxFileSize: z.number().min(0).optional(),
      storageMaxAvatarSize: z.number().min(0).optional(),
      storageMaxBannerSize: z.number().min(0).optional(),
      storageMaxFilesPerMessage: z.number().int().min(0).optional(),
      storageSpaceQuotaByUser: z.number().min(0).optional(),
      storageOverflowAction: z.enum(StorageOverflowAction).optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SETTINGS);

    await updateSettings({
      name: input.name,
      description: input.description,
      password: input.password,
      directMessagesEnabled: input.directMessagesEnabled,
      storageUploadEnabled: input.storageUploadEnabled,
      storageFileSharingInDirectMessages:
        input.storageFileSharingInDirectMessages,
      storageQuota: input.storageQuota,
      storageUploadMaxFileSize: input.storageUploadMaxFileSize,
      storageMaxAvatarSize: input.storageMaxAvatarSize,
      storageMaxBannerSize: input.storageMaxBannerSize,
      storageMaxFilesPerMessage: input.storageMaxFilesPerMessage,
      storageSpaceQuotaByUser: input.storageSpaceQuotaByUser,
      storageOverflowAction: input.storageOverflowAction
    });

    publishSettings();

    enqueueActivityLog({
      type: ActivityLogType.EDIT_SERVER_SETTINGS,
      userId: ctx.userId,
      details: { values: input }
    });
  });

export { updateSettingsRoute };
