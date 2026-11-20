import {
    ChannelPermission,
    OWNER_ROLE_ID,
    UserStatus,
    hasMention
} from '@caesar/shared';
import { createSelector } from '@reduxjs/toolkit';
import { createCachedSelector } from 're-reselect';
import { getReadableRoleColor } from '@/helpers/get-readable-role-color';
import type { IRootState } from '../store';
import {
    channelByIdSelector,
    channelPermissionsSelector,
    channelReadStateByIdSelector,
    channelsByCategoryIdSelector,
    currentVoiceChannelIdSelector
} from './channels/selectors';
import {
    messagesByChannelIdSelector,
    typingMapSelector
} from './messages/selectors';
import { rolesSelector } from './roles/selectors';
import type { TVoiceUser } from './types';
import {
    ownUserIdSelector,
    ownUserSelector,
    tempRoomUsersSelector,
    userByIdSelector,
    usersSelector
} from './users/selectors';
import { voiceChannelStateSelector } from './voice/selectors';

export const connectedSelector = (state: IRootState) => state.server.connected;

export const disconnectInfoSelector = (state: IRootState) =>
    state.server.disconnectInfo;

export const serverNameSelector = (state: IRootState) =>
    state.server.publicSettings?.name;

export const publicServerSettingsSelector = (state: IRootState) =>
    state.server.publicSettings;

export const infoSelector = (state: IRootState) => state.server.info;

export const versionSelector = (state: IRootState) => state.server.version;

export const ownUserRolesSelector = createSelector(
    [ownUserSelector, rolesSelector],
    (ownUser, roles) => {
        if (!ownUser?.roleIds) return [];
        return roles.filter((role) => ownUser.roleIds.includes(role.id));
    }
);

export const isOwnUserOwnerSelector = createSelector(
    [ownUserRolesSelector],
    (ownUserRoles) => ownUserRoles.some((role) => role.id === OWNER_ROLE_ID)
);

export const hasVisibleChannelsInCategorySelector = createCachedSelector(
    [
        (state: IRootState, categoryId: number) =>
            channelsByCategoryIdSelector(state, categoryId),
        channelPermissionsSelector,
        isOwnUserOwnerSelector
    ],
    (channelsInCategory, channelPermissions, isOwner) => {
        if (isOwner) return true;
        if (channelsInCategory.length === 0) return false;

        for (const channel of channelsInCategory) {
            if (!channel.private) return true;
            const permissions =
                channelPermissions[channel.id]?.permissions ??
                ({} as Record<string, boolean>);
            if (permissions[ChannelPermission.VIEW_CHANNEL]) return true;
        }
        return false;
    }
)((_, categoryId: number) => categoryId);

export const userRolesSelector = createSelector(
    [rolesSelector, userByIdSelector],
    (roles, user) => {
        if (!user?.roleIds) return [];
        return roles.filter((role) => user.roleIds.includes(role.id));
    }
);

// name colour comes from the user's first non-default role (roles have no
// explicit ordering, so list order decides); undefined = theme text colour
export const userNameColorSelector = createCachedSelector(
    [rolesSelector, userByIdSelector],
    (roles, user) => {
        if (!user?.roleIds?.length) return undefined;
        const role = roles.find(
            (r) => !r.isDefault && user.roleIds.includes(r.id)
        );
        return role ? getReadableRoleColor(role.color) : undefined;
    }
)((_, userId: number) => userId);

export const typingUsersByChannelIdSelector = createCachedSelector(
    [
        typingMapSelector,
        (_: IRootState, channelId: number) => channelId,
        ownUserIdSelector,
        usersSelector
    ],
    (typingMap, channelId, ownUserId, users) => {
        const userIds = typingMap[channelId] || [];

        return userIds
            .filter((id) => id !== ownUserId)
            .map((id) => users.find((u) => u.id === id))
            .filter((u) => !!u)
            .filter((u) => u.status !== UserStatus.OFFLINE);
    }
)((_, channelId: number) => channelId);

export const voiceUsersByChannelIdSelector = createSelector(
    [usersSelector, voiceChannelStateSelector, tempRoomUsersSelector],
    (users, voiceState, roomUsers) => {
        const voiceUsers: TVoiceUser[] = [];

        if (!voiceState) return voiceUsers;

        Object.entries(voiceState.users).forEach(([userIdStr, state]) => {
            const userId = Number(userIdStr);
            const user =
                users.find((u) => u.id === userId) ??
                roomUsers.find((u) => u.id === userId);

            if (user) {
                voiceUsers.push({
                    ...user,
                    state
                });
            }
        });

        return voiceUsers;
    }
);

export const ownVoiceUserSelector = createSelector(
    [
        ownUserIdSelector,
        (state: IRootState) => {
            const channelId = currentVoiceChannelIdSelector(state);

            if (channelId === undefined) return;

            return voiceUsersByChannelIdSelector(state, channelId);
        }
    ],
    (ownUserId, voiceUsers) =>
        voiceUsers?.find((voiceUser) => voiceUser.id === ownUserId)
);

// this approach has some limitations but it should work for most cases
export const hasUnreadMentionsSelector = createCachedSelector(
    [
        channelReadStateByIdSelector,
        channelByIdSelector,
        messagesByChannelIdSelector,
        ownUserIdSelector
    ],
    (readState, channel, messages, ownUserId) => {
        if (!channel || !messages) return false;

        const unreadMessages = messages.slice(-readState);

        return unreadMessages.some((message) => {
            if (!message.content) return false;

            const isUserMentioned = hasMention(message.content, ownUserId);

            return isUserMentioned;
        });
    }
)((_, channelId: number) => channelId);
