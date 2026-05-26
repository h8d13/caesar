import { TextChannel } from '@/components/channel-view/text';
import { VoiceChannel } from '@/components/channel-view/voice';
import {
    useCurrentVoiceChannelId,
    useSelectedChannelId,
    useSelectedChannelType
} from '@/features/server/channels/hooks';
import { useServerName } from '@/features/server/hooks';
import { infoSelector } from '@/features/server/selectors';
import { useUsers } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import { ChannelType, UserStatus } from '@caesar/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { memo } from 'react';
import { useSelector } from 'react-redux';

const usePing = () => {
    const { data } = useQuery({
        queryKey: ['ping'],
        queryFn: async () => {
            const start = performance.now();
            const result = await getTRPCClient().others.ping.query();
            return {
                serverPing: Math.round(performance.now() - start),
                dbPing: result.dbPing
            };
        }
    });

    return {
        serverPing: data?.serverPing ?? null,
        dbPing: data?.dbPing ?? null
    };
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

const OnlineCount = memo(() => {
    const users = useUsers();
    const onlineCount = users.filter(
        (u) => u.status === UserStatus.ONLINE
    ).length;

    return (
        <div className="flex justify-center mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="tabular-nums font-medium text-foreground">
                    {onlineCount}
                </span>
                {onlineCount === 1 ? 'user' : 'users'}
            </span>
        </div>
    );
});

const WelcomeScreen = memo(
    ({ serverName }: { serverName: string | undefined }) => {
        const info = useSelector(infoSelector);
        const logoSrc = info?.logo ? getFileUrl(info.logo) : '/logo.png';

        return (
            <>
                <div className="flex-col gap-3 h-full w-full hidden lg:flex overflow-auto items-center justify-center">
                    <img
                        src={logoSrc}
                        alt={serverName ?? VITE_APP_NAME}
                        className={
                            info?.logo
                                ? 'max-w-full max-h-32 object-contain rounded-xl'
                                : 'w-24 h-24 rounded-xl opacity-80'
                        }
                    />
                    <h2 className="text-2xl font-semibold text-foreground">
                        Welcome to <span className="bold">{serverName}</span>.
                    </h2>
                    <PingInfo />
                    <OnlineCount />
                </div>
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center md:hidden">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-semibold text-foreground">
                            Welcome to{' '}
                            <span className="bold">{serverName}</span>.
                        </h2>
                        <PingInfo />
                        <OnlineCount />
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
        );
    }
);

type TContentWrapperProps = {
    isDmMode: boolean;
    selectedDmChannelId?: number;
};

const ContentWrapper = memo(
    ({ isDmMode, selectedDmChannelId }: TContentWrapperProps) => {
        const selectedChannelId = useSelectedChannelId();
        const selectedChannelType = useSelectedChannelType();
        const currentVoiceChannelId = useCurrentVoiceChannelId();
        const serverName = useServerName();

        let content;

        if (isDmMode) {
            if (selectedDmChannelId) {
                // Active DM call shows the full VoiceChannel UI inline.
                // No floating modal call happens on this page.
                const inCallWithThisDm =
                    currentVoiceChannelId === selectedDmChannelId;
                content = inCallWithThisDm ? (
                    <VoiceChannel
                        key={selectedDmChannelId}
                        channelId={selectedDmChannelId}
                    />
                ) : (
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
