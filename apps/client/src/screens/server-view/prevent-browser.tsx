import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { usePreventExit } from '@/hooks/use-prevent-exit';
import { memo } from 'react';

const PreventBrowser = memo(() => {
    const currentVoiceChannelId = useCurrentVoiceChannelId();

    usePreventExit(!!currentVoiceChannelId);

    return null;
});

export { PreventBrowser };
