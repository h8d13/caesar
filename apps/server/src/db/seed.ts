import {
  ChannelType,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  sha256,
  STORAGE_DEFAULT_MAX_AVATAR_SIZE,
  STORAGE_DEFAULT_MAX_BANNER_SIZE,
  STORAGE_DEFAULT_MAX_FILES_PER_MESSAGE,
  STORAGE_MAX_FILE_SIZE,
  STORAGE_MIN_QUOTA_PER_USER,
  STORAGE_OVERFLOW_ACTION,
  STORAGE_QUOTA,
  type TICategory,
  type TIChannel,
  type TIRole,
  type TISettings
} from '@caesar/shared';
import {
  categories,
  channels,
  rolePermissions,
  roles,
  settings
} from '@caesar/shared/db/schema';
import { randomUUIDv7 } from 'bun';
import { logger } from '../logger';
import { IS_DEVELOPMENT } from '../utils/env';
import { db } from './index';

const seedDatabase = async () => {
  const needsSeeding = (await db.select().from(settings)).length === 0;

  if (!needsSeeding) return;

  logger.debug('Seeding initial database values...');

  const firstStart = Date.now();
  const originalToken = IS_DEVELOPMENT ? 'dev' : randomUUIDv7();

  const initialSettings: TISettings = {
    name: 'Caesar Server',
    description:
      'This is the default Caesar server description. Change me in the server settings!',
    password: '',
    serverId: Bun.randomUUIDv7(),
    secretToken: await sha256(originalToken),
    directMessagesEnabled: true,
    storageUploadEnabled: true,
    storageQuota: STORAGE_QUOTA,
    storageUploadMaxFileSize: STORAGE_MAX_FILE_SIZE,
    storageMaxAvatarSize: STORAGE_DEFAULT_MAX_AVATAR_SIZE,
    storageMaxBannerSize: STORAGE_DEFAULT_MAX_BANNER_SIZE,
    storageMaxFilesPerMessage: STORAGE_DEFAULT_MAX_FILES_PER_MESSAGE,
    storageFileSharingInDirectMessages: true,
    storageSpaceQuotaByUser: STORAGE_MIN_QUOTA_PER_USER,
    storageOverflowAction: STORAGE_OVERFLOW_ACTION
  };

  await db.insert(settings).values(initialSettings);

  const initialCategories: TICategory[] = [
    {
      name: 'Text Channels',
      position: 1,
      createdAt: firstStart
    },
    {
      name: 'Voice Channels',
      position: 2,
      createdAt: firstStart
    }
  ];

  const initialChannels: TIChannel[] = [
    {
      type: ChannelType.TEXT,
      name: 'General Text',
      position: 0,
      fileAccessToken: randomUUIDv7(),
      fileAccessTokenUpdatedAt: Date.now(),
      categoryId: 1,
      topic: 'General text channel',
      createdAt: firstStart
    },
    {
      type: ChannelType.VOICE,
      name: 'General Voice',
      position: 0,
      fileAccessToken: randomUUIDv7(),
      fileAccessTokenUpdatedAt: Date.now(),
      categoryId: 2,
      topic: 'General voice channel',
      createdAt: firstStart
    }
  ];

  const initialRoles: TIRole[] = [
    {
      name: 'Owner',
      color: '#FFFFFF',
      isDefault: false,
      isPersistent: true,
      createdAt: firstStart
    },
    {
      name: 'Member',
      color: '#FFFFFF',
      isPersistent: true,
      isDefault: true,
      createdAt: firstStart
    }
  ];

  const initialRolePermissions: {
    [roleId: number]: Permission[];
  } = {
    1: Object.values(Permission), // Owner (all permissions)
    2: DEFAULT_ROLE_PERMISSIONS // Member (default permissions)
  };

  await db.insert(categories).values(initialCategories);
  await db.insert(channels).values(initialChannels);
  await db.insert(roles).values(initialRoles);

  for (const [roleId, permissions] of Object.entries(initialRolePermissions)) {
    for (const permission of permissions) {
      await db.insert(rolePermissions).values({
        roleId: Number(roleId),
        permission,
        createdAt: Date.now()
      });
    }
  }

  // The first user assigns themselves the Owner role via useSecretToken
  // (apps/server/src/routers/others/use-secret-token.ts) using the token
  // printed below. We don't pre-insert a userRoles row here because the
  // user it would reference doesn't exist yet, and PRAGMA foreign_keys
  // rejects the dangling FK.
  console.log(
    'First-time setup. Save this owner token, it is not recoverable:'
  );
  console.log(`  useToken("${originalToken}")`);
};

export { seedDatabase };
