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

// M mutes/unmutes the mic, same as the mic button. Not configurable.
const useMuteHotkey = (toggleMic: () => Promise<void>) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'KeyM' || event.repeat) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;

            void toggleMic();
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleMic]);
};

export { useMuteHotkey };
