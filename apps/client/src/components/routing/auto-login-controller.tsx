import { setIsAutoConnecting } from '@/features/app/actions';
import { useIsAppLoading } from '@/features/app/hooks';
import { connect } from '@/features/server/actions';
import { useDisconnectInfo, useIsConnected } from '@/features/server/hooks';
import {
    getLocalStorageItemBool,
    LocalStorageKey,
    removeLocalStorageItem
} from '@/helpers/storage';
import { useIsPageVisible } from '@/hooks/use-is-page-visible';
import { forgetSessionKey, restoreSessionKey } from '@/lib/e2ee';
import { memo, useEffect, useRef } from 'react';

const AutoLoginController = memo(() => {
    const isConnected = useIsConnected();
    const isAppLoading = useIsAppLoading();
    const disconnectInfo = useDisconnectInfo();
    const isPageVisible = useIsPageVisible();
    const autoLoginAttempted = useRef(false);

    useEffect(() => {
        if (
            isAppLoading ||
            isConnected ||
            disconnectInfo ||
            !isPageVisible ||
            autoLoginAttempted.current
        ) {
            // ignore if the app is not done loading, if we're already connected or in the process of connecting
            // hidden: a close while backgrounded resumes once the page is back
            return;
        }

        // Any tab of this browser resumes the session silently: the HttpOnly
        // cookie rides along on the WebSocket upgrade. This is what makes a
        // second tab share the first tab's session instead of forcing a new
        // /login (which would bump sessionEpoch and kick the first tab).
        if (!getLocalStorageItemBool(LocalStorageKey.HAS_SESSION)) return;

        autoLoginAttempted.current = true;

        setIsAutoConnecting(true);

        // unlock before connecting, like the password flow, so the key is
        // fixed for the session; a failed unlock only locks ephemeral DMs
        restoreSessionKey()
            .catch(() => {})
            .then(() => connect())
            .catch(() => {
                // cookie expired / epoch stale: drop the hint so the user sees
                // the connect screen and can log in manually.
                removeLocalStorageItem(LocalStorageKey.HAS_SESSION);
                forgetSessionKey();
            })
            .finally(() => {
                // reset attempt state so if the user logs out and back in they can resume again
                autoLoginAttempted.current = false;
                setIsAutoConnecting(false);
            });
    }, [isAppLoading, isConnected, disconnectInfo, isPageVisible]);

    return null;
});

export { AutoLoginController };
