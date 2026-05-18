import { setIsAutoConnecting } from '@/features/app/actions';
import { useIsAppLoading } from '@/features/app/hooks';
import { connect } from '@/features/server/actions';
import { useDisconnectInfo, useIsConnected } from '@/features/server/hooks';
import {
    getLocalStorageItem,
    LocalStorageKey,
    removeLocalStorageItem,
    SessionStorageKey,
    setSessionStorageItem
} from '@/helpers/storage';
import { memo, useEffect, useRef } from 'react';

const AutoLoginController = memo(() => {
    const isConnected = useIsConnected();
    const isAppLoading = useIsAppLoading();
    const disconnectInfo = useDisconnectInfo();
    const autoLoginAttempted = useRef(false);

    useEffect(() => {
        if (
            isAppLoading ||
            isConnected ||
            disconnectInfo ||
            autoLoginAttempted.current
        ) {
            // ignore if the app is not done loading, if we're already connected or in the process of connecting
            return;
        }

        const savedToken = getLocalStorageItem(
            LocalStorageKey.AUTO_LOGIN_TOKEN
        );

        // Any tab of this browser whose localStorage carries a token resumes
        // the session silently. This is what makes a second tab share the
        // first tab's session instead of forcing a new /login (which would
        // bump sessionEpoch and kick the first tab). The `AUTO_LOGIN` bool
        // is kept as a user preference but no longer gates reuse.
        if (!savedToken) return;

        autoLoginAttempted.current = true;

        setIsAutoConnecting(true);
        setSessionStorageItem(SessionStorageKey.TOKEN, savedToken);

        connect()
            .catch(() => {
                // token expired / epoch stale clear it so the user sees the
                // connect screen and can log in manually.
                removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);
            })
            .finally(() => {
                // reset attempt state so if the user logs out and back in they can resume again
                autoLoginAttempted.current = false;
                setIsAutoConnecting(false);
            });
    }, [isAppLoading, isConnected, disconnectInfo]);

    return null;
});

export { AutoLoginController };
