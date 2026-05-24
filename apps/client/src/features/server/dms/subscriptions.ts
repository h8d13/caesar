import { store } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import { serverSliceActions } from '../slice';

const subscribeToDms = () => {
    const trpc = getTRPCClient();

    const onReadSub = trpc.dms.onRead.subscribe(undefined, {
        onData: (data: {
            channelId: number;
            readerId: number;
            lastReadMessageId: number;
            readAt: number;
        }) => {
            logDebug('[EVENTS] dms.onRead', data);
            store.dispatch(serverSliceActions.setDmReadByPeer(data));
        },
        onError: (err) => console.error('onDmRead subscription error:', err)
    });

    return () => {
        onReadSub.unsubscribe();
    };
};

export { subscribeToDms };
