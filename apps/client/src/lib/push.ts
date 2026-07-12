import {
    browserNotificationsForDmsSelector,
    browserNotificationsForMentionsSelector,
    browserNotificationsSelector
} from '@/features/app/selectors';
import { publicServerSettingsSelector } from '@/features/server/selectors';
import { store } from '@/features/store';
import { getTRPCClient } from '@/lib/trpc';

// Web Push plumbing. The three notification prefs stay client-owned
// (localStorage + redux); this module mirrors them into a per-device
// push subscription on the server so closed/backgrounded PWAs still
// get notified.

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;

const isPushSupported = () =>
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;

    registrationPromise = navigator.serviceWorker
        .register('/sw.js')
        .catch((e) => {
            console.error('service worker registration failed', e);
            registrationPromise = undefined;
            throw e;
        });
};

const getRegistration = () => registrationPromise;

// applicationServerKey wants raw bytes, the VAPID key comes base64url.
// explicit ArrayBuffer so TS doesn't widen to ArrayBufferLike (BufferSource
// rejects SharedArrayBuffer-backed views).
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(normalized);
    const output = new Uint8Array(new ArrayBuffer(raw.length));

    for (let i = 0; i < raw.length; i++) {
        output[i] = raw.charCodeAt(i);
    }

    return output;
};

// Bring the device's push subscription in line with the current prefs:
// any pref on => subscribe/refresh with the prefs mirror, all off =>
// tear down. Safe to call repeatedly (subscribe is an upsert).
const syncPushSubscription = async () => {
    if (!isPushSupported()) return;

    const registration = await getRegistration();

    if (!registration) return;

    const state = store.getState();
    const prefs = {
        notifyAll: browserNotificationsSelector(state),
        notifyMentions: browserNotificationsForMentionsSelector(state),
        notifyDms: browserNotificationsForDmsSelector(state)
    };
    const anyEnabled =
        prefs.notifyAll || prefs.notifyMentions || prefs.notifyDms;

    if (!anyEnabled) {
        const existing = await registration.pushManager.getSubscription();

        if (existing) {
            await getTRPCClient()
                .push.unsubscribe.mutate({ endpoint: existing.endpoint })
                .catch(() => {
                    // server row is pruned on next dead-endpoint push anyway
                });
            await existing.unsubscribe();
        }

        return;
    }

    if (Notification.permission !== 'granted') return;

    const vapidPublicKey = publicServerSettingsSelector(state)?.vapidPublicKey;

    if (!vapidPublicKey) return;

    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    const json = subscription.toJSON();

    if (!json.keys?.p256dh || !json.keys?.auth) return;

    await getTRPCClient().push.subscribe.mutate({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        ...prefs
    });
};

export { getRegistration, registerServiceWorker, syncPushSubscription };
