import { useChannelById } from '@/features/server/channels/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@caesar/shared';
import {
    Alert,
    AlertDescription,
    AlertTitle,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group
} from '@caesar/ui';
import { MessageCircleWarning } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

type TSecurityProps = {
    channelId: number;
};

const Security = memo(({ channelId }: TSecurityProps) => {
    const channel = useChannelById(channelId);

    const onRotateToken = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.channels.rotateFileAccessToken.mutate({ channelId });

            toast.success('File access token rotated successfully');
        } catch (error) {
            toast.error(
                getTrpcError(error, 'Failed to rotate file access token')
            );
        }
    }, [channelId]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription className="flex flex-col space-y-4">
                    <span>Manage some security settings for this channel</span>
                    {!channel?.private && (
                        <Alert variant="destructive">
                            <MessageCircleWarning />
                            <AlertTitle>Public channel</AlertTitle>
                            <AlertDescription>
                                This is a public channel; file links are not
                                token-gated. Rotating the token has no effect
                                unless the channel is set to private. You can do
                                this in the General Settings tab.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Group
                    label="File Access Token"
                    help="Only used for private channels"
                >
                    <p className="text-sm text-muted-foreground">
                        The file access token is used to secure access to files
                        in this channel. Rotating the token will invalidate all
                        existing file links. This means that ALL previously
                        shared files will no longer be accessible.
                    </p>
                    <Button variant="destructive" onClick={onRotateToken}>
                        Rotate Token
                    </Button>
                </Group>
            </CardContent>
        </Card>
    );
});

export { Security };
