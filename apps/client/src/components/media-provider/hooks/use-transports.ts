import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TRemoteUserStreamKinds } from '@/types';
import { getMediasoupKind, StreamKind } from '@caesar/shared';
import { TRPCClientError } from '@trpc/client';
import {
    type AppData,
    type Consumer,
    type Device,
    type RtpCapabilities,
    type Transport
} from 'mediasoup-client/types';
import { useCallback, useMemo, useRef } from 'react';

type TUseTransportParams = {
    addRemoteUserStream: (
        userId: number,
        stream: MediaStream,
        kind: TRemoteUserStreamKinds
    ) => void;
    removeRemoteUserStream: (
        userId: number,
        kind: TRemoteUserStreamKinds
    ) => void;
    addExternalStreamTrack: (
        streamId: number,
        stream: MediaStream,
        kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
    ) => void;
    removeExternalStreamTrack: (
        streamId: number,
        kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
    ) => void;
};

const VIDEO_KINDS: Set<StreamKind> = new Set([
    StreamKind.VIDEO,
    StreamKind.SCREEN,
    StreamKind.EXTERNAL_VIDEO
]);

const LOSS_CHECK_INTERVAL = 3000;
const LOSS_THRESHOLD = 5;

const useTransports = ({
    addRemoteUserStream,
    removeRemoteUserStream,
    addExternalStreamTrack,
    removeExternalStreamTrack
}: TUseTransportParams) => {
    const producerTransport = useRef<Transport<AppData> | undefined>(undefined);
    const consumerTransport = useRef<Transport<AppData> | undefined>(undefined);
    const consumers = useRef<{
        [userId: number]: {
            [kind: string]: Consumer<AppData>;
        };
    }>({});
    const consumerCodecs = useRef<Map<string, string>>(new Map());
    const consumeOperationsInProgress = useRef<Set<string>>(new Set());
    const packetLossMonitors = useRef<
        Map<string, ReturnType<typeof setInterval>>
    >(new Map());

    const startPacketLossMonitor = useCallback(
        (remoteId: number, kind: StreamKind, consumer: Consumer<AppData>) => {
            if (!VIDEO_KINDS.has(kind)) return;

            const monitorKey = `${remoteId}-${kind}`;
            const existing = packetLossMonitors.current.get(monitorKey);
            if (existing) clearInterval(existing);

            let prevPacketsLost = 0;

            const interval = setInterval(async () => {
                if (consumer.closed || consumer.paused) return;

                try {
                    const stats = await consumer.getStats();

                    for (const report of stats.values()) {
                        if (report.type !== 'inbound-rtp') continue;

                        const currentLost = report.packetsLost ?? 0;
                        const delta = currentLost - prevPacketsLost;
                        prevPacketsLost = currentLost;

                        if (delta >= LOSS_THRESHOLD) {
                            logVoice(
                                'Packet loss detected, requesting keyframe',
                                {
                                    remoteId,
                                    kind,
                                    delta
                                }
                            );

                            const trpc = getTRPCClient();
                            await trpc.voice.requestKeyFrame.mutate({
                                remoteId,
                                kind
                            });
                        }
                    }
                } catch {
                    // consumer may have closed during stats check
                }
            }, LOSS_CHECK_INTERVAL);

            packetLossMonitors.current.set(monitorKey, interval);
        },
        []
    );

    const stopPacketLossMonitor = useCallback(
        (remoteId: number, kind: string) => {
            const monitorKey = `${remoteId}-${kind}`;
            const interval = packetLossMonitors.current.get(monitorKey);
            if (interval) {
                clearInterval(interval);
                packetLossMonitors.current.delete(monitorKey);
            }
        },
        []
    );

    const createProducerTransport = useCallback(async (device: Device) => {
        logVoice('Creating producer transport', { device });

        const trpc = getTRPCClient();

        try {
            const params = await trpc.voice.createProducerTransport.mutate();

            logVoice('Got producer transport parameters', { params });

            producerTransport.current = device.createSendTransport(params);

            producerTransport.current.on(
                'connect',
                async ({ dtlsParameters }, callback, errback) => {
                    logVoice('Producer transport connected', {
                        dtlsParameters
                    });

                    try {
                        await trpc.voice.connectProducerTransport.mutate({
                            dtlsParameters
                        });

                        callback();
                    } catch (error) {
                        errback(error as Error);
                        logVoice('Error connecting producer transport', {
                            error
                        });
                    }
                }
            );

            producerTransport.current.on('connectionstatechange', (state) => {
                logVoice('Producer transport connection state changed', {
                    state
                });

                if (state === 'failed') {
                    logVoice(`Producer transport ${state}`);
                    producerTransport.current?.close();
                } else if (state === 'closed') {
                    logVoice('Producer transport closed');
                    producerTransport.current = undefined;
                }
            });

            producerTransport.current.on('icecandidateerror', (error) => {
                logVoice('Producer transport ICE candidate error', { error });
            });

            producerTransport.current.on(
                'produce',
                async ({ rtpParameters, appData }, callback, errback) => {
                    logVoice('Producing new track', { rtpParameters, appData });

                    const { kind } = appData as { kind: StreamKind };

                    if (!producerTransport.current) return;

                    try {
                        const producerId = await trpc.voice.produce.mutate({
                            transportId: producerTransport.current.id,
                            kind,
                            rtpParameters
                        });

                        callback({ id: producerId });
                    } catch (error) {
                        if (error instanceof TRPCClientError) {
                            if (error.data.code === 'FORBIDDEN') {
                                logVoice('Permission denied to produce track', {
                                    kind
                                });
                                errback(
                                    new Error(
                                        `You don't have permission to ${kind} in this channel`
                                    )
                                );

                                return;
                            }
                        }

                        logVoice('Error producing new track', { error });
                        errback(error as Error);
                    }
                }
            );
        } catch (error) {
            logVoice('Error creating producer transport', { error });
        }
    }, []);

    const createConsumerTransport = useCallback(async (device: Device) => {
        logVoice('Creating consumer transport', { device });

        const trpc = getTRPCClient();

        try {
            const params = await trpc.voice.createConsumerTransport.mutate();

            logVoice('Got consumer transport parameters', { params });

            consumerTransport.current = device.createRecvTransport(params);

            consumerTransport.current.on(
                'connect',
                async ({ dtlsParameters }, callback, errback) => {
                    logVoice('Consumer transport connected', {
                        dtlsParameters
                    });

                    try {
                        await trpc.voice.connectConsumerTransport.mutate({
                            dtlsParameters
                        });

                        callback();
                    } catch (error) {
                        errback(error as Error);
                        logVoice('Consumer transport connect error', { error });
                    }
                }
            );

            consumerTransport.current.on('connectionstatechange', (state) => {
                logVoice('Consumer transport connection state changed', {
                    state
                });

                if (state === 'failed') {
                    logVoice(`Consumer transport ${state}, attempting cleanup`);

                    Object.values(consumers.current).forEach(
                        (userConsumers) => {
                            Object.values(userConsumers).forEach((consumer) => {
                                consumer.close();
                            });
                        }
                    );
                    consumers.current = {};

                    consumerTransport.current?.close();
                    consumerTransport.current = undefined;
                } else if (state === 'closed') {
                    logVoice('Consumer transport closed');
                    consumerTransport.current = undefined;
                }
            });

            consumerTransport.current.on('icecandidateerror', (error) => {
                logVoice('Consumer transport ICE candidate error', { error });
            });
        } catch (error) {
            logVoice('Failed to create consumer transport', { error });
        }
    }, []);

    const consume = useCallback(
        async (
            remoteId: number,
            kind: StreamKind,
            routerRtpCapabilities: RtpCapabilities
        ) => {
            if (!consumerTransport.current) {
                logVoice('Consumer transport not available');
                return;
            }

            const operationKey = `${remoteId}-${kind}`;

            if (consumeOperationsInProgress.current.has(operationKey)) {
                logVoice('Consume operation already in progress', {
                    remoteId,
                    kind
                });
                return;
            }

            consumeOperationsInProgress.current.add(operationKey);

            try {
                logVoice('Consuming remote producer', { remoteId, kind });

                const trpc = getTRPCClient();

                const {
                    producerId,
                    consumerId,
                    consumerKind,
                    consumerRtpParameters
                } = await trpc.voice.consume.mutate({
                    kind,
                    remoteId,
                    rtpCapabilities: routerRtpCapabilities
                });

                logVoice('Got consumer parameters', {
                    producerId,
                    consumerId,
                    consumerKind,
                    consumerRtpParameters
                });

                if (!consumers.current[remoteId]) {
                    consumers.current[remoteId] = {};
                }

                const existingConsumer =
                    consumers.current[remoteId][consumerKind];

                if (existingConsumer && !existingConsumer.closed) {
                    logVoice(
                        'Closing existing consumer before creating new one'
                    );

                    existingConsumer.close();
                    delete consumers.current[remoteId][consumerKind];
                }

                const newConsumer = await consumerTransport.current.consume({
                    id: consumerId,
                    producerId: producerId,
                    kind: getMediasoupKind(consumerKind),
                    rtpParameters: consumerRtpParameters
                });

                logVoice('Created new consumer', { newConsumer });

                const cleanupEvents = [
                    'transportclose',
                    'trackended',
                    '@close',
                    'close'
                ];

                cleanupEvents.forEach((event) => {
                    // @ts-expect-error - YOLO
                    newConsumer?.on(event, () => {
                        logVoice(
                            `Consumer cleanup event "${event}" triggered`,
                            {
                                remoteId,
                                kind
                            }
                        );

                        if (
                            kind === StreamKind.EXTERNAL_VIDEO ||
                            kind === StreamKind.EXTERNAL_AUDIO
                        ) {
                            removeExternalStreamTrack(remoteId, kind);
                        } else {
                            removeRemoteUserStream(remoteId, kind);
                        }

                        if (consumers.current[remoteId]?.[consumerKind]) {
                            delete consumers.current[remoteId][consumerKind];
                        }

                        consumerCodecs.current.delete(`${remoteId}-${kind}`);
                        stopPacketLossMonitor(remoteId, kind);
                    });
                });

                consumers.current[remoteId][consumerKind] = newConsumer;
                startPacketLossMonitor(remoteId, kind, newConsumer);

                const codecKey = `${remoteId}-${kind}`;

                const negotiatedCodec =
                    newConsumer.rtpParameters?.codecs?.[0]?.mimeType;

                if (negotiatedCodec) {
                    consumerCodecs.current.set(codecKey, negotiatedCodec);
                }

                const stream = new MediaStream();

                stream.addTrack(newConsumer.track);

                if (
                    kind === StreamKind.EXTERNAL_VIDEO ||
                    kind === StreamKind.EXTERNAL_AUDIO
                ) {
                    addExternalStreamTrack(remoteId, stream, kind);
                } else {
                    addRemoteUserStream(remoteId, stream, kind);
                }

                // Server creates consumers paused so RTP doesn't arrive
                // before the receive consumer is wired. Resume here, then
                // force a keyframe for SVC/simulcast video so decoders
                // dont sit black waiting for the next scheduled keyframe.
                await trpc.voice.resumeConsumer.mutate({ remoteId, kind });

                if (getMediasoupKind(consumerKind) === 'video') {
                    await trpc.voice.requestKeyFrame.mutate({
                        remoteId,
                        kind
                    });
                }
            } catch (error) {
                logVoice('Error consuming remote producer', { error });
            } finally {
                consumeOperationsInProgress.current.delete(operationKey);
            }
        },
        [
            addRemoteUserStream,
            removeRemoteUserStream,
            addExternalStreamTrack,
            removeExternalStreamTrack,
            startPacketLossMonitor,
            stopPacketLossMonitor
        ]
    );

    const consumeExistingProducers = useCallback(
        async (
            routerRtpCapabilities: RtpCapabilities,
            externalStreamTracks?: {
                [streamId: number]: { audio?: boolean; video?: boolean };
            }
        ) => {
            logVoice('Consuming existing producers', { routerRtpCapabilities });

            const trpc = getTRPCClient();

            try {
                const {
                    remoteAudioIds,
                    remoteScreenIds,
                    remoteScreenAudioIds,
                    remoteVideoIds,
                    remoteExternalStreamIds
                } = await trpc.voice.getProducers.query();

                logVoice('Got existing producers', {
                    remoteAudioIds,
                    remoteScreenIds,
                    remoteVideoIds,
                    remoteExternalStreamIds
                });

                remoteAudioIds.forEach((remoteId) => {
                    consume(remoteId, StreamKind.AUDIO, routerRtpCapabilities);
                });

                remoteVideoIds.forEach((remoteId) => {
                    consume(remoteId, StreamKind.VIDEO, routerRtpCapabilities);
                });

                remoteScreenIds.forEach((remoteId) => {
                    consume(remoteId, StreamKind.SCREEN, routerRtpCapabilities);
                });

                remoteScreenAudioIds.forEach((remoteId) => {
                    consume(
                        remoteId,
                        StreamKind.SCREEN_AUDIO,
                        routerRtpCapabilities
                    );
                });

                remoteExternalStreamIds.forEach((streamId: number) => {
                    const tracks = externalStreamTracks?.[streamId];

                    if (tracks?.audio !== false) {
                        consume(
                            streamId,
                            StreamKind.EXTERNAL_AUDIO,
                            routerRtpCapabilities
                        );
                    }
                    if (tracks?.video !== false) {
                        consume(
                            streamId,
                            StreamKind.EXTERNAL_VIDEO,
                            routerRtpCapabilities
                        );
                    }
                });
            } catch (error) {
                logVoice('Error consuming existing producers', { error });
            }
        },
        [consume]
    );

    const getConsumerCodec = useCallback(
        (remoteId: number, kind: StreamKind): string | undefined => {
            return consumerCodecs.current.get(`${remoteId}-${kind}`);
        },
        []
    );

    const pauseConsumer = useCallback(
        async (remoteId: number, kind: TRemoteUserStreamKinds) => {
            const consumer = consumers.current[remoteId]?.[kind];

            if (consumer && !consumer.closed && !consumer.paused) {
                consumer.pause();
                logVoice('Paused consumer', { remoteId, kind });

                try {
                    const trpc = getTRPCClient();
                    await trpc.voice.pauseConsumer.mutate({ remoteId, kind });
                } catch (error) {
                    logVoice('Error pausing server consumer', { error });
                }
            }
        },
        []
    );

    const resumeConsumer = useCallback(
        async (remoteId: number, kind: TRemoteUserStreamKinds) => {
            const consumer = consumers.current[remoteId]?.[kind];

            if (consumer && !consumer.closed && consumer.paused) {
                consumer.resume();
                logVoice('Resumed consumer', { remoteId, kind });

                try {
                    const trpc = getTRPCClient();
                    await trpc.voice.resumeConsumer.mutate({ remoteId, kind });
                } catch (error) {
                    logVoice('Error resuming server consumer', { error });
                }
            }
        },
        []
    );

    const cleanupTransports = useCallback(() => {
        logVoice('Cleaning up transports');

        Object.values(consumers.current).forEach((userConsumers) => {
            Object.values(userConsumers).forEach((consumer) => {
                if (!consumer.closed) {
                    consumer.close();
                }
            });
        });

        consumers.current = {};
        consumerCodecs.current.clear();

        packetLossMonitors.current.forEach((interval) =>
            clearInterval(interval)
        );
        packetLossMonitors.current.clear();

        consumeOperationsInProgress.current.clear();

        if (producerTransport.current && !producerTransport.current.closed) {
            producerTransport.current.close();
        }

        producerTransport.current = undefined;

        if (consumerTransport.current && !consumerTransport.current.closed) {
            consumerTransport.current.close();
        }

        consumerTransport.current = undefined;

        logVoice('Transports cleanup complete');
    }, []);

    // All ref objects (producerTransport, consumerTransport, consumers) are
    // stable across renders by definition of useRef. All callbacks above are
    // useCallback'd with stable deps. Memoizing the return shape on those
    // identities means MediaProvider only re-spreads when something material
    // changed, instead of every render.
    return useMemo(
        () => ({
            producerTransport,
            consumerTransport,
            consumers,
            createProducerTransport,
            createConsumerTransport,
            consume,
            consumeExistingProducers,
            cleanupTransports,
            getConsumerCodec,
            pauseConsumer,
            resumeConsumer
        }),
        [
            createProducerTransport,
            createConsumerTransport,
            consume,
            consumeExistingProducers,
            cleanupTransports,
            getConsumerCodec,
            pauseConsumer,
            resumeConsumer
        ]
    );
};

export { useTransports };
