import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useChannelCan } from '@/features/server/hooks';
import { ChannelPermission } from '@caesar/shared';
import { useEffect } from 'react';

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;

    return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
    );
};

// M mutes/unmutes the mic, D deafens/undeafens, same as the buttons in the
// user bar. Not configurable.
const useVoiceHotkeys = (
    toggleMic: () => Promise<void>,
    toggleSound: () => Promise<void>
) => {
    const channelCan = useChannelCan(useCurrentVoiceChannelId());
    // mirror the mic button, disabled without SPEAK: the server ignores the
    // unmute, so toggling locally would show a mic that isn't live
    const canSpeak = channelCan(ChannelPermission.SPEAK);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;

            if (event.code === 'KeyM' && canSpeak) {
                void toggleMic();
            } else if (event.code === 'KeyD') {
                void toggleSound();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleMic, toggleSound, canSpeak]);
};

export { useVoiceHotkeys };
