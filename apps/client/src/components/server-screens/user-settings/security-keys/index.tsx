import { getTRPCClient } from '@/lib/trpc';
import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Input
} from '@caesar/ui';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type TCredential = {
    id: number;
    credentialId: string;
    name: string | null;
    deviceType: string | null;
    backedUp: boolean;
    createdAt: number;
    lastUsedAt: number | null;
};

const formatDate = (ms: number): string =>
    new Date(ms).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

const SecurityKeys = memo(() => {
    const [credentials, setCredentials] = useState<TCredential[]>([]);
    const [loading, setLoading] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');

    const refresh = useCallback(async () => {
        const trpc = getTRPCClient();
        try {
            const list = await trpc.webauthn.list.query();
            setCredentials(list);
        } catch {
            // ignored; list query failing is non-fatal for the page
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const addKey = useCallback(async () => {
        const trpc = getTRPCClient();
        setLoading(true);
        try {
            const options = await trpc.webauthn.registerStart.mutate();
            const response = await startRegistration({ optionsJSON: options });
            await trpc.webauthn.registerFinish.mutate({
                response,
                name: newKeyName.trim() || undefined
            });
            setNewKeyName('');
            toast.success('Security key registered');
            await refresh();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            toast.error(`Failed to register key: ${message}`);
        } finally {
            setLoading(false);
        }
    }, [newKeyName, refresh]);

    const removeKey = useCallback(
        async (id: number) => {
            const trpc = getTRPCClient();
            try {
                await trpc.webauthn.remove.mutate({ id });
                toast.success('Security key removed');
                await refresh();
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                toast.error(`Failed to remove key: ${message}`);
            }
        },
        [refresh]
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Security Keys</CardTitle>
                <CardDescription>
                    Register a hardware security key as a second factor on
                    login. Once at least one key is registered, you will be
                    prompted for it after entering your password.
                </CardDescription>
                <CardAction>
                    <Button onClick={addKey} disabled={loading}>
                        <KeyRound size={16} />
                        {loading ? 'Waiting for key…' : 'Add key'}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                <Group
                    label="Label (optional)"
                    help="A name to help you identify this key in the list (e.g. 'YubiKey 5C')."
                >
                    <Input
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="YubiKey 5C"
                        maxLength={64}
                    />
                </Group>

                {credentials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No security keys registered.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {credentials.map((c) => (
                            <li
                                key={c.id}
                                className="flex items-center justify-between gap-2 rounded-md border p-3"
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                        {c.name ?? 'Unnamed key'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Added {formatDate(c.createdAt)}
                                        {c.lastUsedAt &&
                                            ` · Last used ${formatDate(c.lastUsedAt)}`}
                                        {c.backedUp && ' · Synced'}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeKey(c.id)}
                                    aria-label="Remove security key"
                                >
                                    <Trash2 size={16} />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
});

export { SecurityKeys };
