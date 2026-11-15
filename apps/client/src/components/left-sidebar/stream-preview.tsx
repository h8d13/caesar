import { getTRPCClient } from '@/lib/trpc';
import { STREAM_PREVIEW_INTERVAL_MS, StreamKind } from '@caesar/shared';
import { Skeleton, TooltipContent } from '@caesar/ui';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Video } from 'lucide-react';
import { memo } from 'react';

type TStreamPreviewKind = StreamKind.VIDEO | StreamKind.SCREEN;

type TStreamPreviewProps = {
    channelId: number;
    userId: number;
    kind: TStreamPreviewKind;
};

// Mounted by Radix only while the tooltip is open: the still is fetched on
// hover and refreshed at the streamer's upload cadence while it stays open.
const StreamPreviewImage = memo(
    ({ channelId, userId, kind }: TStreamPreviewProps) => {
        const { data, isPending } = useQuery({
            queryKey: ['voice', 'streamPreview', channelId, userId, kind],
            queryFn: () =>
                getTRPCClient().voice.getStreamPreview.query({
                    channelId,
                    userId,
                    kind
                }),
            staleTime: STREAM_PREVIEW_INTERVAL_MS / 2,
            refetchInterval: STREAM_PREVIEW_INTERVAL_MS
        });

        if (isPending) return <Skeleton className="size-full" />;

        if (!data) {
            return (
                <div className="flex size-full items-center justify-center text-background/60">
                    No preview yet
                </div>
            );
        }

        return (
            <img
                src={data.image}
                alt=""
                draggable={false}
                className="size-full object-contain"
            />
        );
    }
);

StreamPreviewImage.displayName = 'StreamPreviewImage';

// Hover card on a streaming voice member, like the sidebar stream preview
// elsewhere: lets users outside the call see what is being shown.
const StreamPreview = memo((props: TStreamPreviewProps) => {
    const isScreen = props.kind === StreamKind.SCREEN;
    const Icon = isScreen ? Monitor : Video;

    return (
        <TooltipContent side="right" sideOffset={8} className="p-1.5">
            <div className="flex w-60 flex-col gap-1.5">
                <div className="aspect-video w-full overflow-hidden rounded bg-black">
                    <StreamPreviewImage {...props} />
                </div>
                <div className="flex items-center gap-1.5 px-0.5">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="font-medium">
                        {isScreen ? 'Sharing screen' : 'Camera on'}
                    </span>
                </div>
            </div>
        </TooltipContent>
    );
});

StreamPreview.displayName = 'StreamPreview';

export { StreamPreview };
