import { setSelectedChannelId } from '@/features/server/channels/actions';
import {
    useChannelsMap,
    useCurrentVoiceChannelId
} from '@/features/server/channels/hooks';
import { joinVoice } from '@/features/server/voice/actions';
import { useMedia } from '@/features/server/voice/hooks';
import { getLocalStorageItemAsJSON, LocalStorageKey } from '@/helpers/storage';
import { ChannelType } from '@caesar/shared';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

const loadExpandedValue = (categoryId: number): boolean => {
    const expandedMap = getLocalStorageItemAsJSON<Record<number, boolean>>(
        LocalStorageKey.CATEGORIES_EXPANDED,
        {}
    );

    return expandedMap?.[categoryId] ?? true;
};

const saveExpandedValue = (categoryId: number, expanded: boolean): void => {
    const expandedMap = getLocalStorageItemAsJSON<Record<number, boolean>>(
        LocalStorageKey.CATEGORIES_EXPANDED,
        {}
    );

    const newExpandedMap = {
        ...expandedMap,
        [categoryId]: expanded
    };

    localStorage.setItem(
        LocalStorageKey.CATEGORIES_EXPANDED,
        JSON.stringify(newExpandedMap)
    );
};

const useCategoryExpanded = (categoryId: number) => {
    const [expanded, setExpanded] = useState(loadExpandedValue(categoryId));

    const toggleExpanded = useCallback(() => {
        setExpanded((prev) => {
            const newValue = !prev;

            saveExpandedValue(categoryId, newValue);

            return newValue;
        });
    }, [categoryId]);

    return useMemo(
        () => ({ expanded, toggleExpanded }),
        [expanded, toggleExpanded]
    );
};

const useSelectChannel = () => {
    const { init } = useMedia();
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const channelsMap = useChannelsMap();

    const selectChannel = useCallback(
        async (channelId: number) => {
            const channel = channelsMap[channelId];

            if (!channel) return;

            setSelectedChannelId(channel.id);

            if (
                channel?.type === ChannelType.VOICE &&
                currentVoiceChannelId !== channel.id
            ) {
                const response = await joinVoice(channel.id);

                if (!response) {
                    // joining voice failed
                    setSelectedChannelId(undefined);
                    toast.error('Failed to join voice channel');

                    return;
                }

                try {
                    await init(response, channel.id);
                } catch {
                    setSelectedChannelId(undefined);
                    toast.error('Failed to initialize voice connection');
                }
            }
        },
        [channelsMap, currentVoiceChannelId, init]
    );

    return selectChannel;
};

export { useCategoryExpanded, useSelectChannel };
