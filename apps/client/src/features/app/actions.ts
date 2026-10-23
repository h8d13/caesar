import { LocalStorageKey, setLocalStorageItemBool } from '@/helpers/storage';
import { syncPushSubscription } from '@/lib/push';
import { getTRPCClient } from '@/lib/trpc';
import { store } from '../store';
import { appSliceActions } from './slice';

export const setModViewOpen = (isOpen: boolean, userId?: number) =>
    store.dispatch(
        appSliceActions.setModViewOpen({
            modViewOpen: isOpen,
            userId
        })
    );

export const resetApp = () => {
    store.dispatch(
        appSliceActions.setModViewOpen({
            modViewOpen: false,
            userId: undefined
        })
    );
    store.dispatch(appSliceActions.setStoryViewerUserId(undefined));
};

export const openStoryViewer = (userId: number) =>
    store.dispatch(appSliceActions.setStoryViewerUserId(userId));

export const closeStoryViewer = () =>
    store.dispatch(appSliceActions.setStoryViewerUserId(undefined));

export const setDmsOpen = (open: boolean) =>
    store.dispatch(appSliceActions.setDmsOpen(open));

export const setSelectedDmChannelId = (channelId: number | undefined) => {
    store.dispatch(appSliceActions.setSelectedDmChannelId(channelId));

    // covers re-entering a DM that received messages while away. per-msg
    // arrival path only fires when a new message lands; selecting an
    // already-populated channel needs its own poke for receipts to ride.
    if (channelId !== undefined) {
        getTRPCClient()
            .channels.markAsRead.mutate({ channelId })
            .catch((e) => console.error('markAsRead on dm select failed', e));
    }
};

// enabling any notification pref needs OS-level permission; returns false
// when the user denied it so the toggle stays off
const ensureNotificationPermission = async (
    enabled: boolean
): Promise<boolean> => {
    if (!enabled || !('Notification' in window)) return true;

    const permission = await Notification.requestPermission();

    return permission === 'granted';
};

// mirror the prefs into this device's Web Push subscription so closed
// PWAs keep getting notified; the in-app path reads redux directly
const syncPush = () => {
    void syncPushSubscription().catch((e) =>
        console.error('push subscription sync failed', e)
    );
};

export const setBrowserNotifications = async (enabled: boolean) => {
    if (!(await ensureNotificationPermission(enabled))) return;

    store.dispatch(appSliceActions.setBrowserNotifications(enabled));
    setLocalStorageItemBool(LocalStorageKey.BROWSER_NOTIFICATIONS, enabled);
    syncPush();
};

export const setBrowserNotificationsForMentions = async (enabled: boolean) => {
    if (!(await ensureNotificationPermission(enabled))) return;

    store.dispatch(appSliceActions.setBrowserNotificationsForMentions(enabled));
    setLocalStorageItemBool(
        LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_MENTIONS,
        enabled
    );
    syncPush();
};

export const setBrowserNotificationsForDms = async (enabled: boolean) => {
    if (!(await ensureNotificationPermission(enabled))) return;

    store.dispatch(appSliceActions.setBrowserNotificationsForDms(enabled));
    setLocalStorageItemBool(
        LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_DMS,
        enabled
    );
    syncPush();
};
