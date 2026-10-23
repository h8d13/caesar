import { getUrlFromServer } from '@/helpers/get-file-url';
import type { TServerInfo } from '@caesar/shared';
import { toast } from 'sonner';
import { setInfo } from '../server/pre-auth-actions';
import { store } from '../store';
import { appSliceActions } from './slice';

// App bootstrap that runs before login. Kept apart from ./actions, which
// pulls in tRPC and push, so the login page ships without them.

const setAppLoading = (loading: boolean) =>
    store.dispatch(appSliceActions.setAppLoading(loading));

export const setIsAutoConnecting = (isAutoConnecting: boolean) =>
    store.dispatch(appSliceActions.setIsAutoConnecting(isAutoConnecting));

const fetchServerInfo = async (): Promise<TServerInfo | undefined> => {
    try {
        const url = getUrlFromServer();
        const response = await fetch(`${url}/info`);

        if (!response.ok) {
            throw new Error('Failed to fetch server info');
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error('Error fetching server info:', error);
    }
};

export const loadApp = async () => {
    const info = await fetchServerInfo();

    if (!info) {
        console.error('Failed to load server info during app load');
        toast.error('Failed to load server info');
        return;
    }

    setInfo(info);
    setAppLoading(false);
};
