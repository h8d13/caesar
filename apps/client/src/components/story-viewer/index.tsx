import { closeStoryViewer } from '@/features/app/actions';
import { useStoryViewerUserId } from '@/features/app/hooks';
import { useIsOwnUser, useUserById } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError, type TJoinedStatusImage } from '@caesar/shared';
import { IconButton } from '@caesar/ui';
import { Trash, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '../user-avatar';

// Each story segment shows for this long before auto-advancing. Matches the
// familiar Instagram/Snapchat cadence.
const SEGMENT_MS = 5000;

type TInnerProps = {
    userId: number;
};

// Mounted only while a viewer is open (keyed by userId), so all timers and
// fetch state reset cleanly between users.
const StoryViewerInner = memo(({ userId }: TInnerProps) => {
    const user = useUserById(userId);
    const isOwnUser = useIsOwnUser(userId);
    const [images, setImages] = useState<TJoinedStatusImage[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const result = await getTRPCClient().users.getStatusImages.query({
                userId
            });
            setImages(result);
        } catch {
            setImages([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    const close = useCallback(() => closeStoryViewer(), []);

    const goNext = useCallback(() => {
        setIndex((i) => {
            if (i >= images.length - 1) {
                close();
                return i;
            }
            return i + 1;
        });
    }, [images.length, close]);

    const goPrev = useCallback(() => {
        setIndex((i) => Math.max(i - 1, 0));
    }, []);

    // auto-advance the active segment. re-armed whenever the index changes;
    // empty deps on images.length keep it stable across the same set.
    useEffect(() => {
        if (loading || images.length === 0) return;

        const timer = setTimeout(goNext, SEGMENT_MS);
        return () => clearTimeout(timer);
    }, [index, loading, images.length, goNext]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowLeft') goPrev();
            else if (e.key === 'ArrowRight') goNext();
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [close, goPrev, goNext]);

    // nothing (left) to show: close once the fetch settles.
    useEffect(() => {
        if (!loading && images.length === 0) close();
    }, [loading, images.length, close]);

    const current = images[index];

    const onRemove = useCallback(async () => {
        if (!current) return;

        try {
            await getTRPCClient().users.removeStatusImage.mutate({
                id: current.id
            });
            toast.success('Status removed');

            const next = images.filter((img) => img.id !== current.id);
            setImages(next);
            setIndex((i) => Math.min(i, Math.max(next.length - 1, 0)));
            if (next.length === 0) close();
        } catch (error) {
            toast.error(getTrpcError(error, 'Could not remove status'));
        }
    }, [current, images, close]);

    if (loading || !current) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90">
            {/* tap zones for manual prev/next */}
            <button
                type="button"
                aria-label="Previous"
                className="absolute inset-y-0 left-0 w-1/3 cursor-default focus:outline-none"
                onClick={goPrev}
            />
            <button
                type="button"
                aria-label="Next"
                className="absolute inset-y-0 right-0 w-1/3 cursor-default focus:outline-none"
                onClick={goNext}
            />

            <div className="relative flex h-full max-h-[90vh] w-full max-w-md flex-col px-3 py-4">
                {/* segment progress bars */}
                <div className="flex gap-1">
                    {images.map((image, i) => (
                        <div
                            key={image.id}
                            className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
                        >
                            <div
                                className="h-full bg-white"
                                style={
                                    i < index
                                        ? { width: '100%' }
                                        : i === index
                                          ? {
                                                width: '100%',
                                                animation: `story-fill ${SEGMENT_MS}ms linear forwards`
                                            }
                                          : { width: '0%' }
                                }
                                // key on index so the active bar restarts its
                                // animation each time we land on it.
                                key={`${image.id}-${index}`}
                            />
                        </div>
                    ))}
                </div>

                {/* header */}
                <div className="z-10 mt-2 flex items-center gap-2">
                    <UserAvatar
                        userId={userId}
                        className="h-7 w-7"
                        showStatusBadge={false}
                    />
                    <span className="text-sm font-medium text-white">
                        {user ? getRenderedUsername(user, userId) : ''}
                    </span>

                    <div className="ml-auto flex items-center gap-1">
                        {isOwnUser && (
                            <IconButton
                                icon={Trash}
                                variant="ghost"
                                size="sm"
                                title="Remove this status"
                                onClick={onRemove}
                                className="text-white hover:text-red-400"
                            />
                        )}
                        <IconButton
                            icon={X}
                            variant="ghost"
                            size="sm"
                            title="Close"
                            onClick={close}
                            className="text-white hover:text-white/70"
                        />
                    </div>
                </div>

                {/* image */}
                <div className="z-0 flex flex-1 items-center justify-center overflow-hidden">
                    <img
                        src={getFileUrl(current.file)}
                        alt="Status"
                        className="max-h-full max-w-full rounded-md object-contain"
                    />
                </div>
            </div>

            <style>{`@keyframes story-fill { from { width: 0%; } to { width: 100%; } }`}</style>
        </div>
    );
});

StoryViewerInner.displayName = 'StoryViewerInner';

const StoryViewer = memo(() => {
    const userId = useStoryViewerUserId();

    if (userId === undefined) return null;

    return <StoryViewerInner key={userId} userId={userId} />;
});

StoryViewer.displayName = 'StoryViewer';

export { StoryViewer };
