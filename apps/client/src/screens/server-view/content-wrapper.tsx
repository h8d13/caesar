import { TextChannel } from '@/components/channel-view/text';
import { VoiceChannel } from '@/components/channel-view/voice';
import {
    useSelectedChannelId,
    useSelectedChannelType
} from '@/features/server/channels/hooks';
import { useServerName } from '@/features/server/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { ChannelType } from '@sharkord/shared';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

const usePing = () => {
    const [serverPing, setServerPing] = useState<number | null>(null);
    const [dbPing, setDbPing] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        const trpc = getTRPCClient();
        const start = performance.now();
        try {
            const result = await trpc.others.ping.query();
            const roundTrip = Math.round(performance.now() - start);
            setServerPing(roundTrip);
            setDbPing(result.dbPing);
        } catch {
            setServerPing(null);
            setDbPing(null);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { serverPing, dbPing };
};

const PingInfo = memo(() => {
    const { serverPing, dbPing } = usePing();

    return (
        <div className="flex gap-4 text-xs text-muted-foreground mt-3 justify-center">
            <span>
                RT:{' '}
                <span className="tabular-nums font-medium text-foreground">
                    {serverPing !== null ? `${serverPing}ms` : '...'}
                </span>
            </span>
            <span>
                DB:{' '}
                <span className="tabular-nums font-medium text-foreground">
                    {dbPing !== null ? `${dbPing}ms` : '...'}
                </span>
            </span>
        </div>
    );
});

const WelcomeScreen = memo(
    ({ serverName }: { serverName: string | undefined }) => (
        <>
            <div className="flex-col gap-2 h-full w-full hidden lg:flex overflow-auto items-center justify-center">
                <h2 className="text-2xl font-semibold text-foreground">
                    Welcome to{' '}
                    <span className="bold">{serverName}</span>.
                </h2>
                <PingInfo />
            </div>
            <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center md:hidden">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-semibold text-foreground">
                        Welcome to{' '}
                        <span className="bold">{serverName}</span>.
                    </h2>
                    <PingInfo />
                </div>
                <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">
                            <ArrowRight />
                        </span>
                        <span>Swipe right to open the channel list</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg">
                            <ArrowLeft />
                        </span>
                        <span>Swipe left to open the user list</span>
                    </div>
                </div>
            </div>
        </>
    )
);

type TContentWrapperProps = {
    isDmMode: boolean;
    selectedDmChannelId?: number;
};

const ContentWrapper = memo(
    ({ isDmMode, selectedDmChannelId }: TContentWrapperProps) => {
        const selectedChannelId = useSelectedChannelId();
        const selectedChannelType = useSelectedChannelType();
        const serverName = useServerName();

        let content;

        if (isDmMode) {
            if (selectedDmChannelId) {
                content = (
                    <TextChannel
                        key={selectedDmChannelId}
                        channelId={selectedDmChannelId}
                    />
                );
            } else {
                content = (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Select a direct message or start a new one.
                    </div>
                );
            }

            return (
                <main className="flex flex-1 flex-col bg-background relative min-w-0 min-h-0">
                    {content}
                </main>
            );
        }

        if (selectedChannelId) {
            if (selectedChannelType === ChannelType.TEXT) {
                content = (
                    <TextChannel
                        key={selectedChannelId}
                        channelId={selectedChannelId}
                    />
                );
            } else if (selectedChannelType === ChannelType.VOICE) {
                content = (
                    <VoiceChannel
                        key={selectedChannelId}
                        channelId={selectedChannelId}
                    />
                );
            }
        } else {
            content = <WelcomeScreen serverName={serverName} />;
        }

        return (
            <main className="flex flex-1 flex-col bg-background relative min-w-0 min-h-0">
                {content}
            </main>
        );
    }
);

export { ContentWrapper };
