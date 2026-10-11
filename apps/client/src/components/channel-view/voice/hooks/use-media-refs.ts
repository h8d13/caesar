import { useDevices } from '@/components/devices-provider/hooks/use-devices';
import { useMediaControl } from '@/components/media-provider/media-control-context';
import { useIsOwnUser } from '@/features/server/users/hooks';
import { useMedia } from '@/features/server/voice/hooks';
import { applyAudioOutputDevice } from '@/helpers/audio-output';
import { StreamKind } from '@caesar/shared';
import { useEffect, useMemo } from 'react';

const useMediaRefs = (remoteId: number) => {
    const {
        remoteUserStreams,
        localVideoStream,
        localScreenShareStream,
        ownVoiceState,
        getOrCreateRefs,
        pauseConsumer,
        resumeConsumer
    } = useMedia();
    const isOwnUser = useIsOwnUser(remoteId);
    const {
        getVolume,
        getUserVolumeKey,
        getUserScreenVolumeKey,
        isStreamHidden,
        getUserVideoKey,
        getUserScreenVideoKey
    } = useMediaControl();
    const { devices } = useDevices();

    const { videoRef, audioRef, screenShareRef, screenShareAudioRef } =
        getOrCreateRefs(remoteId);

    const videoHidden = isStreamHidden(getUserVideoKey(remoteId));
    const screenVideoHidden = isStreamHidden(getUserScreenVideoKey(remoteId));

    // Slice the per-user view once. Redux-toolkit/immer keeps unchanged
    // sub-references stable, so this slice only flips identity when THIS
    // user's streams actually change. Using it in deps prevents the memos
    // below from invalidating when other users' streams update.
    const userStreams = remoteUserStreams[remoteId];

    const videoStream = useMemo(() => {
        if (isOwnUser) {
            // "Hide own stream" toggle suppresses local preview without
            // removing the own card from the grid (see voice/index.tsx).
            return videoHidden ? undefined : localVideoStream;
        }

        return userStreams?.[StreamKind.VIDEO];
    }, [userStreams, isOwnUser, localVideoStream, videoHidden]);

    const audioStream = useMemo(() => {
        if (isOwnUser) return undefined;

        return userStreams?.[StreamKind.AUDIO];
    }, [userStreams, isOwnUser]);

    const screenShareStream = useMemo(() => {
        if (isOwnUser) return localScreenShareStream;

        return userStreams?.[StreamKind.SCREEN];
    }, [userStreams, isOwnUser, localScreenShareStream]);

    const screenShareAudioStream = useMemo(() => {
        if (isOwnUser) return undefined;

        return userStreams?.[StreamKind.SCREEN_AUDIO];
    }, [userStreams, isOwnUser]);

    const userVolumeKey = getUserVolumeKey(remoteId);
    const userVolume = getVolume(userVolumeKey);

    const userScreenVolumeKey = getUserScreenVolumeKey(remoteId);
    const userScreenVolume = getVolume(userScreenVolumeKey);

    useEffect(() => {
        if (isOwnUser) return;

        if (videoHidden) {
            pauseConsumer(remoteId, StreamKind.VIDEO);
        } else {
            resumeConsumer(remoteId, StreamKind.VIDEO);
        }
    }, [videoHidden, remoteId, isOwnUser, pauseConsumer, resumeConsumer]);

    useEffect(() => {
        if (isOwnUser) return;

        if (screenVideoHidden) {
            pauseConsumer(remoteId, StreamKind.SCREEN);
        } else {
            resumeConsumer(remoteId, StreamKind.SCREEN);
        }
    }, [screenVideoHidden, remoteId, isOwnUser, pauseConsumer, resumeConsumer]);

    useEffect(() => {
        if (!videoStream || !videoRef.current) return;

        videoRef.current.srcObject = videoStream;
    }, [videoStream, videoRef, videoHidden]);

    useEffect(() => {
        if (!audioStream || !audioRef.current) return;

        if (audioRef.current.srcObject !== audioStream) {
            audioRef.current.srcObject = audioStream;
        }

        audioRef.current.volume = userVolume / 100;
        audioRef.current.muted = ownVoiceState.soundMuted;

        applyAudioOutputDevice(audioRef.current, devices.playbackId);
    }, [
        audioStream,
        audioRef,
        userVolume,
        devices.playbackId,
        ownVoiceState.soundMuted
    ]);

    useEffect(() => {
        if (!screenShareAudioStream || !screenShareAudioRef.current) return;

        if (screenShareAudioRef.current.srcObject !== screenShareAudioStream) {
            screenShareAudioRef.current.srcObject = screenShareAudioStream;
        }

        screenShareAudioRef.current.volume = userScreenVolume / 100;
        screenShareAudioRef.current.muted = ownVoiceState.soundMuted;

        applyAudioOutputDevice(screenShareAudioRef.current, devices.playbackId);
    }, [
        screenShareAudioStream,
        screenShareAudioRef,
        userScreenVolume,
        devices.playbackId,
        ownVoiceState.soundMuted
    ]);

    useEffect(() => {
        if (!screenShareStream || !screenShareRef.current) return;

        if (screenShareRef.current.srcObject !== screenShareStream) {
            screenShareRef.current.srcObject = screenShareStream;
        }
    }, [screenShareStream, screenShareRef, screenVideoHidden]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = ownVoiceState.soundMuted;
        }

        if (screenShareAudioRef.current) {
            screenShareAudioRef.current.muted = ownVoiceState.soundMuted;
        }

    }, [
        ownVoiceState.soundMuted,
        audioRef,
        screenShareAudioRef,
        audioStream,
        screenShareAudioStream
    ]);

    const hasAudioStream = !!audioStream;
    const hasVideoStream = !!videoStream && !videoHidden;
    const hasScreenShareStream = !!screenShareStream && !screenVideoHidden;
    const hasScreenShareAudioStream = !!screenShareAudioStream;

    // Stabilize the return shape so memo'd consumers (voice-user-card,
    // voice-audio-streams) skip re-renders when nothing they care about
    // changed. Refs from getOrCreateRefs() are stable per-id.
    return useMemo(
        () => ({
            videoRef,
            audioRef,
            screenShareRef,
            screenShareAudioRef,
            hasAudioStream,
            hasVideoStream,
            hasScreenShareStream,
            hasScreenShareAudioStream
        }),
        [
            videoRef,
            audioRef,
            screenShareRef,
            screenShareAudioRef,
            hasAudioStream,
            hasVideoStream,
            hasScreenShareStream,
            hasScreenShareAudioStream
        ]
    );
};

export { useMediaRefs };
