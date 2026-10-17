import {
    getLocalStorageItem,
    getLocalStorageItemBool,
    LocalStorageKey
} from '@/helpers/storage';
import type { TDevices } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TAppState {
    appLoading: boolean;
    isAutoConnecting: boolean;
    devices: TDevices | undefined;
    modViewOpen: boolean;
    modViewUserId: number | undefined;
    dmsOpen: boolean;
    selectedDmChannelId: number | undefined;
    // userId whose stories the fullscreen viewer is showing; undefined = closed
    storyViewerUserId: number | undefined;
    browserNotifications: boolean;
    browserNotificationsForMentions: boolean;
    browserNotificationsForDms: boolean;
}

const initialState: TAppState = {
    appLoading: true,
    // AutoLoginController only flips this after the first post-load render,
    // which flashed <Connect /> between the two loading screens
    isAutoConnecting: !!getLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN),
    devices: undefined,
    modViewOpen: false,
    modViewUserId: undefined,
    dmsOpen: false,
    selectedDmChannelId: undefined,
    storyViewerUserId: undefined,
    browserNotifications: getLocalStorageItemBool(
        LocalStorageKey.BROWSER_NOTIFICATIONS,
        false
    ),
    browserNotificationsForMentions: getLocalStorageItemBool(
        LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_MENTIONS,
        false
    ),
    browserNotificationsForDms: getLocalStorageItemBool(
        LocalStorageKey.BROWSER_NOTIFICATIONS_FOR_DMS,
        false
    )
};

export const appSlice = createSlice({
    name: 'app',
    initialState,
    reducers: {
        setAppLoading: (state, action: PayloadAction<boolean>) => {
            state.appLoading = action.payload;
        },
        setDevices: (state, action: PayloadAction<TDevices>) => {
            state.devices = action.payload;
        },
        setModViewOpen: (
            state,
            action: PayloadAction<{
                modViewOpen: boolean;
                userId?: number;
            }>
        ) => {
            state.modViewOpen = action.payload.modViewOpen;
            state.modViewUserId = action.payload.userId;
        },
        setIsAutoConnecting: (state, action: PayloadAction<boolean>) => {
            state.isAutoConnecting = action.payload;
        },
        setDmsOpen: (state, action: PayloadAction<boolean>) => {
            state.dmsOpen = action.payload;
        },
        setSelectedDmChannelId: (
            state,
            action: PayloadAction<number | undefined>
        ) => {
            state.selectedDmChannelId = action.payload;
        },
        setStoryViewerUserId: (
            state,
            action: PayloadAction<number | undefined>
        ) => {
            state.storyViewerUserId = action.payload;
        },
        setBrowserNotifications: (state, action: PayloadAction<boolean>) => {
            state.browserNotifications = action.payload;
        },
        setBrowserNotificationsForMentions: (
            state,
            action: PayloadAction<boolean>
        ) => {
            state.browserNotificationsForMentions = action.payload;
        },
        setBrowserNotificationsForDms: (
            state,
            action: PayloadAction<boolean>
        ) => {
            state.browserNotificationsForDms = action.payload;
        }
    }
});

const appSliceActions = appSlice.actions;
const appSliceReducer = appSlice.reducer;

export { appSliceActions, appSliceReducer };
