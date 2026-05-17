export enum LocalStorageKey {
    IDENTITY = 'caesar-identity',
    REMEMBER_CREDENTIALS = 'caesar-remember-identity',
    USER_PASSWORD = 'caesar-user-password',
    SERVER_PASSWORD = 'caesar-server-password',
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
    THREAD_SIDEBAR_WIDTH = 'caesar-thread-sidebar-width',
    LEFT_SIDEBAR_WIDTH = 'caesar-left-sidebar-width',
    RIGHT_SIDEBAR_WIDTH = 'caesar-right-sidebar-width',
    CATEGORIES_EXPANDED = 'caesar-categories-expanded',
    AUTO_LOGIN = 'caesar-auto-login',
    AUTO_LOGIN_TOKEN = 'caesar-auto-login-token',
    LAST_SELECTED_CHANNEL = 'caesar-last-selected-channel',
    AUTO_JOIN_LAST_CHANNEL = 'caesar-auto-join-last-channel',
    BROWSER_NOTIFICATIONS = 'caesar-browser-notifications',
    NICKNAMES = 'caesar-nicknames',
    WHITEBOARD_SIDEBAR_WIDTH = 'caesar-whiteboard-sidebar-width',
    VOICE_CHAT_SIDEBAR_WIDTH = 'caesar-voice-chat-sidebar-width',
    BROWSER_NOTIFICATIONS_FOR_MENTIONS = 'caesar-browser-notifications-for-mentions',
    HIDDEN_STREAMS = 'caesar-hidden-streams',
    HIDDEN_DMS = 'caesar-hidden-dms',
    BIRTHDAY_LAST_SHOWN = 'caesar-birthday-last-shown'
}

export enum SessionStorageKey {
    TOKEN = 'caesar-token'
}

const getLocalStorageItem = (key: LocalStorageKey): string | null => {
    return localStorage.getItem(key);
};

const getLocalStorageItemBool = (
    key: LocalStorageKey,
    defaultValue: boolean = false
): boolean => {
    const item = localStorage.getItem(key);

    if (item === null) {
        return defaultValue ?? false;
    }

    return item === 'true';
};

const setLocalStorageItemBool = (
    key: LocalStorageKey,
    value: boolean
): void => {
    localStorage.setItem(key, value.toString());
};

const getLocalStorageItemAsJSON = <T>(
    key: LocalStorageKey,
    defaultValue: T | undefined = undefined
): T | undefined => {
    const item = localStorage.getItem(key);

    if (item) {
        return JSON.parse(item) as T;
    }

    return defaultValue;
};

const setLocalStorageItemAsJSON = <T>(key: LocalStorageKey, value: T): void => {
    localStorage.setItem(key, JSON.stringify(value));
};

const setLocalStorageItem = (key: LocalStorageKey, value: string): void => {
    localStorage.setItem(key, value);
};

const removeLocalStorageItem = (key: LocalStorageKey): void => {
    localStorage.removeItem(key);
};

const getSessionStorageItem = (key: SessionStorageKey): string | null => {
    return sessionStorage.getItem(key);
};

const setSessionStorageItem = (key: SessionStorageKey, value: string): void => {
    sessionStorage.setItem(key, value);
};

const removeSessionStorageItem = (key: SessionStorageKey): void => {
    sessionStorage.removeItem(key);
};

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
