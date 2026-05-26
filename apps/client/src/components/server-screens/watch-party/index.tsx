import { getTRPCClient } from '@/lib/trpc';
import { Button, Input } from '@caesar/ui';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ServerScreenLayout } from '../server-screen-layout';
import { PredictionPool } from './prediction-pool';

type TWatchPartyProps = {
    close: () => void;
};

const WatchParty = memo(({ close }: TWatchPartyProps) => {
    const [videoId, setVideoId] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Fetch the current shared stream on open, then stay in sync: setUrl/clear
    // broadcast WATCH_PARTY_UPDATE to every connected client.
    useEffect(() => {
        const trpc = getTRPCClient();
        let active = true;

        trpc.watchParty.getState.query().then((state) => {
            if (active) setVideoId(state.videoId);
        });

        const sub = trpc.watchParty.onUpdate.subscribe(undefined, {
            onData: (state) => setVideoId(state.videoId),
            onError: (err) =>
                console.error('watchParty.onUpdate subscription error:', err)
        });

        return () => {
            active = false;
            sub.unsubscribe();
        };
    }, []);

    const handleShare = useCallback(async () => {
        const value = url.trim();
        if (!value) return;

        setSubmitting(true);
        try {
            await getTRPCClient().watchParty.setUrl.mutate({ url: value });
            setUrl('');
        } catch {
            toast.error('Not a recognizable YouTube link');
        } finally {
            setSubmitting(false);
        }
    }, [url]);

    const handleStop = useCallback(async () => {
        try {
            await getTRPCClient().watchParty.clear.mutate();
        } catch {
            toast.error('Could not stop the watch party');
        }
    }, []);

    return (
        <ServerScreenLayout close={close} title="Watch party">
            <div className="flex flex-col gap-4 h-full">
                <div className="flex gap-2">
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleShare();
                        }}
                        placeholder="Paste a YouTube link to share with everyone…"
                        className="flex-1"
                    />
                    <Button
                        onClick={handleShare}
                        disabled={submitting || !url.trim()}
                    >
                        Share
                    </Button>
                    {videoId && (
                        <Button variant="ghost" onClick={handleStop}>
                            Stop
                        </Button>
                    )}
                </div>

                <div className="flex gap-4 flex-1 min-h-0">
                    <div className="flex-1 min-w-0">
                        {videoId ? (
                            <div className="relative h-full overflow-hidden rounded-lg bg-black">
                                <iframe
                                    key={videoId}
                                    className="absolute inset-0 h-full w-full"
                                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                                    title="Watch party"
                                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                    allowFullScreen
                                />
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No stream yet. Paste a YouTube link to start the
                                party.
                            </div>
                        )}
                    </div>
                    <PredictionPool className="w-80 shrink-0 overflow-auto border-l border-border pl-4" />
                </div>
            </div>
        </ServerScreenLayout>
    );
});

export { WatchParty };
