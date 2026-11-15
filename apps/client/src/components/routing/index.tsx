import { useIsAppLoading, useIsAutoConnecting } from '@/features/app/hooks';
import {
    useDisconnectInfo,
    useIsConnected,
    useServerName
} from '@/features/server/hooks';
import { useTempRoomLinkToken } from '@/features/server/temp-rooms/link';
import { Connect } from '@/screens/connect';
import { Disconnected } from '@/screens/disconnected';
import { LoadingApp } from '@/screens/loading-app';
import { DisconnectCode } from '@caesar/shared';
import { Spinner } from '@caesar/ui';
import { lazy, memo, Suspense, useEffect } from 'react';

const ServerView = lazy(() =>
    import('@/screens/server-view').then((m) => ({ default: m.ServerView }))
);

const GuestRoom = lazy(() =>
    import('@/screens/guest-room').then((m) => ({ default: m.GuestRoom }))
);

const ServerViewFallback = () => (
    <div className="flex flex-col justify-center items-center h-full gap-2">
        <Spinner size="lg" />
    </div>
);

const Routing = memo(() => {
    const isConnected = useIsConnected();
    const isAppLoading = useIsAppLoading();
    const disconnectInfo = useDisconnectInfo();
    const serverName = useServerName();
    const isAutoConnecting = useIsAutoConnecting();
    const tempRoomToken = useTempRoomLinkToken();

    useEffect(() => {
        if (isConnected && serverName) {
            document.title = `${serverName} - ${VITE_APP_NAME}`;
            return;
        }

        document.title = VITE_APP_NAME;
    }, [isConnected, serverName]);

    if (isAppLoading) {
        return <LoadingApp text={`Loading ${VITE_APP_NAME}`} />;
    }

    if (!isConnected) {
        if (isAutoConnecting) {
            return <LoadingApp text="Logging in automatically..." />;
        }

        // A temp room link without a session: the guest view. With one,
        // auto-login runs first and the signed-in app offers the room.
        // Before the disconnect screens: a guest whose room closed goes
        // back to the join form, which says why.
        if (tempRoomToken) {
            return (
                <Suspense fallback={<ServerViewFallback />}>
                    <GuestRoom token={tempRoomToken} />
                </Suspense>
            );
        }

        if (
            disconnectInfo &&
            (!disconnectInfo.wasClean ||
                disconnectInfo.code === DisconnectCode.KICKED ||
                disconnectInfo.code === DisconnectCode.BANNED ||
                disconnectInfo.code === DisconnectCode.SESSION_SUPERSEDED)
        ) {
            return <Disconnected info={disconnectInfo} />;
        }

        return <Connect />;
    }

    return (
        <Suspense fallback={<ServerViewFallback />}>
            <ServerView />
        </Suspense>
    );
});

export { Routing };
