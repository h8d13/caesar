export enum LocalStorageKey {
    VITE_UI_THEME = 'vite-ui-theme',
    DEVICES_SETTINGS = 'caesar-devices-settings',
    FLOATING_CARD_POSITION = 'caesar-floating-card-position',
    FLOATING_CARD_SIZE = 'caesar-floating-card-size',
    LEFT_SIDEBAR_STATE = 'caesar-left-sidebar-state',
    RIGHT_SIDEBAR_STATE = 'caesar-right-sidebar-state',
    VOICE_CHAT_SHOW_USER_BANNERS = 'caesar-voice-chat-show-user-banners',
    VOLUME_SETTINGS = 'caesar-volume-settings',
    RECENT_EMOJIS = 'caesar-recent-emojis',
    DEBUG = 'caesar-debug',
    DRAFT_MESSAGES = 'caesar-draft-messages',
    HIDE_NON_VIDEO_PARTICIPANTS = 'caesar-hide-non-video-participants',
    LEFT_SIDEBAR_WIDTH = 'caesar-left-sidebar-width',
    RIGHT_SIDEBAR_WIDTH = 'caesar-right-sidebar-width',
    CATEGORIES_EXPANDED = 'caesar-categories-expanded',
    AUTO_LOGIN = 'caesar-auto-login',
    AUTO_LOGIN_TOKEN = 'caesar-auto-login-token',
    BROWSER_NOTIFICATIONS = 'caesar-browser-notifications',
    NICKNAMES = 'caesar-nicknames',
    BROWSER_NOTIFICATIONS_FOR_MENTIONS = 'caesar-browser-notifications-for-mentions',
    BROWSER_NOTIFICATIONS_FOR_DMS = 'caesar-browser-notifications-for-dms',
    HIDDEN_STREAMS = 'caesar-hidden-streams',
    HIDDEN_DMS = 'caesar-hidden-dms',
    BIRTHDAY_LAST_SHOWN = 'caesar-birthday-last-shown'
}

export enum SessionStorageKey {
    TOKEN = 'caesar-token'
}

// Storage access throws when site data is blocked (LibreWolf, hardened
// Firefox) and stored JSON can be corrupt; neither should crash the app, so
// every access falls back instead.
const tryStorage = <T>(fn: () => T, fallback: T): T => {
    try {
        return fn();
    } catch {
        return fallback;
    }
};

const getLocalStorageItem = (key: LocalStorageKey): string | null =>
    tryStorage(() => localStorage.getItem(key), null);

const getLocalStorageItemBool = (
    key: LocalStorageKey,
    defaultValue: boolean = false
): boolean => {
    const item = getLocalStorageItem(key);

    if (item === null) {
        return defaultValue ?? false;
    }

    return item === 'true';
};

const setLocalStorageItemBool = (key: LocalStorageKey, value: boolean): void =>
    setLocalStorageItem(key, value.toString());

const getLocalStorageItemAsJSON = <T>(
    key: LocalStorageKey,
    defaultValue?: T
): T | undefined => {
    const item = getLocalStorageItem(key);

    if (item) {
        return tryStorage(() => JSON.parse(item) as T, defaultValue);
    }

    return defaultValue;
};

const setLocalStorageItemAsJSON = <T>(key: LocalStorageKey, value: T): void =>
    setLocalStorageItem(key, JSON.stringify(value));

const setLocalStorageItem = (key: LocalStorageKey, value: string): void =>
    tryStorage(() => localStorage.setItem(key, value), undefined);

const removeLocalStorageItem = (key: LocalStorageKey): void =>
    tryStorage(() => localStorage.removeItem(key), undefined);

const getSessionStorageItem = (key: SessionStorageKey): string | null =>
    tryStorage(() => sessionStorage.getItem(key), null);

const setSessionStorageItem = (key: SessionStorageKey, value: string): void =>
    tryStorage(() => sessionStorage.setItem(key, value), undefined);

const removeSessionStorageItem = (key: SessionStorageKey): void =>
    tryStorage(() => sessionStorage.removeItem(key), undefined);

export {
    getLocalStorageItem,
    getLocalStorageItemAsJSON,
    getLocalStorageItemBool,
    getSessionStorageItem,
    removeLocalStorageItem,
    removeSessionStorageItem,
    setLocalStorageItem,
    setLocalStorageItemAsJSON,
    setLocalStorageItemBool,
    setSessionStorageItem
};
