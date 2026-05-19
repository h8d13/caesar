import {
    dmsOpenSelector,
    selectedDmChannelIdSelector
} from '@/features/app/selectors';
import type { IRootState } from '@/features/store';
import type { TChannel } from '@caesar/shared';
import { createSelector } from '@reduxjs/toolkit';
import { createCachedSelector } from 're-reselect';

const DEFAULT_OBJECT = {};

export const channelsSelector = (state: IRootState) => state.server.channels;

export const selectedChannelIdSelector = (state: IRootState) =>
    state.server.selectedChannelId;

export const selectedChannelTypeSelector = createSelector(
    [channelsSelector, selectedChannelIdSelector],
    (channels, selectedChannelId) =>
        channels.find((channel) => channel.id === selectedChannelId)?.type
);

export const currentVoiceChannelIdSelector = (state: IRootState) =>
    state.server.currentVoiceChannelId;

export const channelPermissionsSelector = (state: IRootState) =>
    state.server.channelPermissions;

export const channelsReadStatesSelector = (state: IRootState) =>
    state.server.readStatesMap;

export const channelReadStateByIdSelector = (
    state: IRootState,
    channelId: number
) => state.server.readStatesMap[channelId] ?? 0;

export const hasUnreadMentionSelector = (
    state: IRootState,
    channelId: number
) => state.server.channelsWithUnreadMention.includes(channelId);

export const channelByIdSelector = createCachedSelector(
    [channelsSelector, (_: IRootState, channelId: number) => channelId],
    (channels, channelId) =>
        channels.find((channel) => channel.id === channelId)
)((_, channelId: number) => channelId);

export const channelsByCategoryIdSelector = createCachedSelector(
    [channelsSelector, (_: IRootState, categoryId: number) => categoryId],
    (channels, categoryId) =>
        channels
            .filter((channel) => channel.categoryId === categoryId)
            .sort((a, b) => a.position - b.position)
)((_, categoryId: number) => categoryId);

// "Selected" tracks two distinct cursors: selectedChannelId for server mode,
// selectedDmChannelId for DM mode (toggled by dmsOpen). Both must be honored
// or the top-bar voice controls hide whenever the active panel is a DM call.
export const isCurrentVoiceChannelSelectedSelector = createSelector(
    [
        selectedChannelIdSelector,
        selectedDmChannelIdSelector,
        dmsOpenSelector,
        currentVoiceChannelIdSelector
    ],
    (
        selectedChannelId,
        selectedDmChannelId,
        dmsOpen,
        currentVoiceChannelId
    ) => {
        if (currentVoiceChannelId === undefined) return false;
        if (dmsOpen) return selectedDmChannelId === currentVoiceChannelId;
        return selectedChannelId === currentVoiceChannelId;
    }
);

export const channelPermissionsByIdSelector = (
    state: IRootState,
    channelId: number
) => state.server.channelPermissions[channelId] || DEFAULT_OBJECT;

export const channelsMapSelector = createSelector(
    channelsSelector,
    (channels) => {
        const map: Record<number, TChannel> = {};

        channels.forEach((channel) => {
            map[channel.id] = channel;
        });

        return map;
    }
);

export const directMessagesUnreadCountSelector = createSelector(
    [channelsSelector, channelsReadStatesSelector],
    (channels, readStates) => {
        return channels
            .filter((channel) => channel.isDm)
            .reduce((acc, channel) => acc + (readStates[channel.id] ?? 0), 0);
    }
);
