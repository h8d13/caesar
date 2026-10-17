import type { IRootState } from '../store';

export const appLoadingSelector = (state: IRootState) => state.app.appLoading;

export const isAutoConnectingSelector = (state: IRootState) =>
    state.app.isAutoConnecting;

export const modViewOpenSelector = (state: IRootState) => state.app.modViewOpen;

export const modViewUserIdSelector = (state: IRootState) =>
    state.app.modViewUserId;

export const dmsOpenSelector = (state: IRootState) => state.app.dmsOpen;

export const selectedDmChannelIdSelector = (state: IRootState) =>
    state.app.selectedDmChannelId;

export const storyViewerUserIdSelector = (state: IRootState) =>
    state.app.storyViewerUserId;

export const browserNotificationsSelector = (state: IRootState) =>
    state.app.browserNotifications;

export const browserNotificationsForMentionsSelector = (state: IRootState) =>
    state.app.browserNotificationsForMentions;

export const browserNotificationsForDmsSelector = (state: IRootState) =>
    state.app.browserNotificationsForDms;
