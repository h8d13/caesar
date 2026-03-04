import { store } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import { currentVoiceChannelIdSelector } from '../channels/selectors';
import { soundsSelector } from '../sounds/selectors';
import {
    addExternalStreamToVoiceChannel,
    addUserToVoiceChannel,
    removeExternalStreamFromVoiceChannel,
    removeUserFromVoiceChannel,
    updateExternalStreamInVoiceChannel,
    updateVoiceChannelState,
    updateVoiceUserState
} from './actions';

import { emitSoundboardPlay } from './soundboard-audio';

const subscribeToVoice = () => {
    const trpc = getTRPCClient();

    const onUserJoinVoiceSub = trpc.voice.onJoin.subscribe(undefined, {
        onData: ({ channelId, userId, state }) => {
            logDebug('[EVENTS] voice.onJoin', { channelId, userId, state });
            addUserToVoiceChannel(userId, channelId, state);
        },
        onError: (err) =>
            console.error('onUserJoinVoice subscription error:', err)
    });

    const onUserLeaveVoiceSub = trpc.voice.onLeave.subscribe(undefined, {
        onData: ({ channelId, userId }) => {
            logDebug('[EVENTS] voice.onLeave', { channelId, userId });
            removeUserFromVoiceChannel(userId, channelId);
        },
        onError: (err) =>
            console.error('onUserLeaveVoice subscription error:', err)
    });

    const onUserUpdateVoiceSub = trpc.voice.onUpdateState.subscribe(undefined, {
        onData: ({ channelId, userId, state }) => {
            logDebug('[EVENTS] voice.onUpdateState', {
                channelId,
                userId,
                state
            });
            updateVoiceUserState(userId, channelId, state);
        },
        onError: (err) =>
            console.error('onUserUpdateVoice subscription error:', err)
    });

    const onVoiceChannelStateSub = trpc.voice.onChannelState.subscribe(
        undefined,
        {
            onData: ({ channelId, activeSince }) => {
                updateVoiceChannelState(channelId, activeSince);
            },
            onError: (err) =>
                console.error('onVoiceChannelStateSub subscription error:', err)
        }
    );

    const onVoiceAddExternalStreamSub =
        trpc.voice.onAddExternalStream.subscribe(undefined, {
            onData: ({ channelId, streamId, stream }) => {
                logDebug('[EVENTS] voice.onAddExternalStream', {
                    channelId,
                    streamId,
                    stream
                });
                addExternalStreamToVoiceChannel(channelId, streamId, stream);
            },
            onError: (err) =>
                console.error(
                    'onVoiceAddExternalStreamSub subscription error:',
                    err
                )
        });

    const onVoiceUpdateExternalStreamSub =
        trpc.voice.onUpdateExternalStream.subscribe(undefined, {
            onData: ({ channelId, streamId, stream }) => {
                logDebug('[EVENTS] voice.onUpdateExternalStream', {
                    channelId,
                    streamId,
                    stream
                });
                updateExternalStreamInVoiceChannel(channelId, streamId, stream);
            },
            onError: (err) =>
                console.error(
                    'onVoiceUpdateExternalStreamSub subscription error:',
                    err
                )
        });

    const onVoiceRemoveExternalStreamSub =
        trpc.voice.onRemoveExternalStream.subscribe(undefined, {
            onData: ({ channelId, streamId }) => {
                logDebug('[EVENTS] voice.onRemoveExternalStream', {
                    channelId,
                    streamId
                });
                removeExternalStreamFromVoiceChannel(channelId, streamId);
            },
            onError: (err) =>
                console.error(
                    'onVoiceRemoveExternalStreamSub subscription error:',
                    err
                )
        });

    const onSoundboardPlaySub = trpc.voice.onSoundboardPlay.subscribe(
        undefined,
        {
            onData: ({ channelId, soundId }) => {
                const currentChannelId = currentVoiceChannelIdSelector(
                    store.getState()
                );
                if (currentChannelId !== channelId) return;

                logDebug('[EVENTS] voice.onSoundboardPlay', { soundId });
                const sounds = soundsSelector(store.getState());
                const sound = sounds.find((s) => s.id === soundId);
                if (sound) {
                    const url = getFileUrl(sound.file);
                    if (url) {
                        emitSoundboardPlay(url);
                    }
                }
            },
            onError: (err) =>
                console.error('onSoundboardPlay subscription error:', err)
        }
    );

    return () => {
        onUserJoinVoiceSub.unsubscribe();
        onUserLeaveVoiceSub.unsubscribe();
        onUserUpdateVoiceSub.unsubscribe();
        onVoiceChannelStateSub.unsubscribe();
        onVoiceAddExternalStreamSub.unsubscribe();
        onVoiceUpdateExternalStreamSub.unsubscribe();
        onVoiceRemoveExternalStreamSub.unsubscribe();
        onSoundboardPlaySub.unsubscribe();
    };
};

export { subscribeToVoice };
