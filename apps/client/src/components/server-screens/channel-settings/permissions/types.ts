import type { ChannelPermission } from '@caesar/shared';

export type TChannelPermission = {
    permission: ChannelPermission;
    allow: boolean;
};

export type TChannelPermissionType = 'role' | 'user';
