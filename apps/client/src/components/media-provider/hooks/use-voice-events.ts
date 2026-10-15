import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TRemoteUserStreamKinds } from '@/types';
import type { StreamKind } from '@caesar/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { useEffect } from 'react';

type TEvents = {
    consume: (
        remoteId: number,
        kind: StreamKind,
        routerRtpCapabilities: RtpCapabilities
    ) => Promise<void>;
    removeRemoteUserStream: (
        userId: number,
        kind: TRemoteUserStreamKinds
    ) => void;
    clearRemoteUserStreamsForUser: (userId: number) => void;
    rtpCapabilities: RtpCapabilities | null | undefined;
};

const useVoiceEvents = ({
    consume,
    removeRemoteUserStream,
    clearRemoteUserStreamsForUser,
    rtpCapabilities
}: TEvents) => {
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const ownUserId = useOwnUserId();

    useEffect(() => {
        if (!currentVoiceChannelId) {
            logVoice('Voice events not initialized - missing channelId');
            return;
        }

        if (!rtpCapabilities) {
            logVoice('Voice events not initialized - missing RTP capabilities');
            return;
        }

        const trpc = getTRPCClient();

        let isCleaningUp = false;

        const onVoiceNewProducerSub = trpc.voice.onNewProducer.subscribe(
            undefined,
            {
                onData: ({ remoteId, kind, channelId }) => {
                    if (currentVoiceChannelId !== channelId || isCleaningUp)
                        return;

                    if (remoteId === ownUserId) {
                        logVoice('Ignoring own producer event', {
                            remoteId,
                            ownUserId,
                            kind,
                            channelId
                        });

                        return;
                    }

                    logVoice('New producer event received', {
                        remoteId,
                        kind,
                        channelId
                    });

                    // consume handles and logs its own failures
                    void consume(remoteId, kind, rtpCapabilities);
                },
                onError: (error) => {
                    logVoice('onVoiceNewProducer subscription error', {
                        error
                    });
                }
            }
        );

        const onVoiceProducerClosedSub = trpc.voice.onProducerClosed.subscribe(
            undefined,
            {
                onData: ({ channelId, remoteId, kind }) => {
                    if (currentVoiceChannelId !== channelId || isCleaningUp)
                        return;

                    logVoice('Producer closed event received', {
                        remoteId,
                        kind,
                        channelId
                    });

                    try {
                        removeRemoteUserStream(remoteId, kind);
                    } catch (error) {
                        logVoice(
                            'Error removing remote stream for closed producer',
                            {
                                error,
                                remoteId,
                                kind,
                                channelId
                            }
                        );
                    }
                },
                onError: (error) => {
                    logVoice('onVoiceProducerClosed subscription error', {
                        error
                    });
                }
            }
        );

        const onVoiceUserLeaveSub = trpc.voice.onLeave.subscribe(undefined, {
            onData: ({ channelId, userId }) => {
                if (currentVoiceChannelId !== channelId || isCleaningUp) return;

                logVoice('User leave event received', { userId, channelId });

                try {
                    clearRemoteUserStreamsForUser(userId);
                } catch (error) {
                    logVoice('Error clearing remote streams for user', {
                        error
                    });
                }
            },
            onError: (error) => {
                logVoice('onVoiceUserLeave subscription error', { error });
            }
        });

        return () => {
            logVoice('Cleaning up voice events');

            isCleaningUp = true;

            onVoiceNewProducerSub.unsubscribe();
            onVoiceProducerClosedSub.unsubscribe();
            onVoiceUserLeaveSub.unsubscribe();
        };
    }, [
        currentVoiceChannelId,
        ownUserId,
        consume,
        removeRemoteUserStream,
        clearRemoteUserStreamsForUser,
        rtpCapabilities
    ]);
};

export { useVoiceEvents };
