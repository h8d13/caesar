import type { Producer } from 'mediasoup-client/types';
import { useCallback, useRef, useState } from 'react';

const useLocalStreams = () => {
    const [localVideoStream, setLocalVideoStream] = useState<
        MediaStream | undefined
    >(undefined);
    const [localAudioStream, setLocalAudioStream] = useState<
        MediaStream | undefined
    >(undefined);
    const [localScreenShareStream, setLocalScreenShare] = useState<
        MediaStream | undefined
    >(undefined);
    const [localScreenShareAudioStream, setLocalScreenShareAudio] = useState<
        MediaStream | undefined
    >(undefined);

    const localVideoProducerRef = useRef<Producer | undefined>(undefined);
    const localAudioProducerRef = useRef<Producer | undefined>(undefined);
    const localScreenShareProducerRef = useRef<Producer | undefined>(undefined);
    const localScreenShareAudioProducerRef = useRef<Producer | undefined>(
        undefined
    );

    const clearLocalStreams = useCallback(() => {
        localVideoStream?.getTracks().forEach((track) => track.stop());
        localAudioStream?.getTracks().forEach((track) => track.stop());
        localScreenShareStream?.getTracks().forEach((track) => track.stop());
        localScreenShareAudioStream
            ?.getTracks()
            .forEach((track) => track.stop());

        setLocalVideoStream(undefined);
        setLocalAudioStream(undefined);
        setLocalScreenShare(undefined);
        setLocalScreenShareAudio(undefined);

        localVideoProducerRef.current?.close();
        localAudioProducerRef.current?.close();
        localScreenShareProducerRef.current?.close();
        localScreenShareAudioProducerRef.current?.close();

        localVideoProducerRef.current = undefined;
        localAudioProducerRef.current = undefined;
        localScreenShareProducerRef.current = undefined;
        localScreenShareAudioProducerRef.current = undefined;
    }, [
        localAudioStream,
        localScreenShareStream,
        localVideoStream,
        localScreenShareAudioStream
    ]);

    return {
        localVideoStream,
        setLocalVideoStream,

        localAudioStream,
        setLocalAudioStream,

        localScreenShareStream,
        setLocalScreenShare,

        localScreenShareAudioStream,
        setLocalScreenShareAudio,

        localVideoProducerRef,
        localAudioProducerRef,
        localScreenShareProducerRef,
        localScreenShareAudioProducerRef,

        clearLocalStreams
    };
};

export { useLocalStreams };
