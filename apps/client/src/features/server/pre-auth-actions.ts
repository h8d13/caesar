import type { TServerInfo } from '@caesar/shared';
import { store } from '../store';
import { serverSliceActions } from './slice';
import type { TDisconnectInfo } from './types';

// What the login and disconnected screens dispatch. Kept apart from
// ./actions, which pulls in tRPC, e2ee and every subscription, so the page
// an anonymous visitor loads ships without them.

export const setDisconnectInfo = (info: TDisconnectInfo | undefined) => {
    store.dispatch(serverSliceActions.setDisconnectInfo(info));
};

export const setInfo = (info: TServerInfo | undefined) => {
    store.dispatch(serverSliceActions.setInfo(info));
};
