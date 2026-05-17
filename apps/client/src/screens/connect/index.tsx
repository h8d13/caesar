import { connect } from '@/features/server/actions';
import { useInfo } from '@/features/server/hooks';
import { getFileUrl, getUrlFromServer } from '@/helpers/get-file-url';
import {
    getLocalStorageItem,
    getLocalStorageItemBool,
    LocalStorageKey,
    removeLocalStorageItem,
    SessionStorageKey,
    setLocalStorageItem,
    setLocalStorageItemBool,
    setSessionStorageItem
} from '@/helpers/storage';
import { useForm } from '@/hooks/use-form';
import { derivePriv, setPriv } from '@/lib/e2ee';
import { TestId } from '@caesar/shared';
import {
    Alert,
    AlertDescription,
    AlertTitle,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Group,
    Input,
    Switch
} from '@caesar/ui';
import { ShieldCheck } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

const Connect = memo(() => {
    const { values, r, setErrors, onChange } = useForm<{
        identity: string;
        password: string;
        confirmPassword: string;
        rememberCredentials: boolean;
        autoLogin: boolean;
    }>({
        identity: getLocalStorageItem(LocalStorageKey.IDENTITY) || '',
        password: getLocalStorageItem(LocalStorageKey.USER_PASSWORD) || '',
        confirmPassword: '',
        rememberCredentials: !!getLocalStorageItem(
            LocalStorageKey.REMEMBER_CREDENTIALS
        ),
        autoLogin: getLocalStorageItemBool(LocalStorageKey.AUTO_LOGIN)
    });

    const [loading, setLoading] = useState(false);
    const info = useInfo();

    const inviteCode = useMemo(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const invite = urlParams.get('invite');
        return invite || undefined;
    }, []);

    // Invite-only server: signup happens iff an invite code is in the URL.
    // Otherwise this is a login form for existing users.
    const isSignup = !!inviteCode;
    const passwordMismatch =
        isSignup && values.confirmPassword !== values.password;

    const onConnectClick = useCallback(async () => {
        if (isSignup && values.password !== values.confirmPassword) {
            setErrors({
                confirmPassword: 'Passwords do not match'
            });
            return;
        }

        setLoading(true);

        try {
            const url = getUrlFromServer();
            const response = await fetch(`${url}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: values.identity,
                    password: values.password,
                    invite: inviteCode,
                    autoLogin: values.autoLogin || undefined
                })
            });

            if (!response.ok) {
                const data = await response.json();

                setErrors(data.errors || {});
                return;
            }

            const data = (await response.json()) as { token: string };

            // E2EE: argon2id is ~1-2s sync on main thread. Defer so
            // connect() / Suspense fallback paint immediately; derive
            // runs after the loading spinner is already on screen. The
            // <E2eeKeyRegister /> controller picks up the pub via the
            // priv subscriber and registers once joinServer has set
            // authenticated=true.
            const password = values.password;
            const identity = values.identity;
            setTimeout(() => {
                setPriv(derivePriv(password, identity));
            }, 0);

            setSessionStorageItem(SessionStorageKey.TOKEN, data.token);
            setLocalStorageItemBool(
                LocalStorageKey.AUTO_LOGIN,
                values.autoLogin
            );

            if (values.autoLogin) {
                setLocalStorageItem(
                    LocalStorageKey.AUTO_LOGIN_TOKEN,
                    data.token
                );
            } else {
                removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);
            }

            await connect();
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            toast.error(`Could not connect: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    }, [
        values.identity,
        values.password,
        values.confirmPassword,
        values.autoLogin,
        isSignup,
        setErrors,
        inviteCode
    ]);

    const logoSrc = useMemo(() => {
        if (info?.logo) {
            return getFileUrl(info.logo);
        }

        return '/logo.png';
    }, [info]);

    return (
        <div className="flex flex-col gap-2 justify-center items-center h-full">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="flex flex-col items-center gap-2 text-center">
                        <img
                            src={logoSrc}
                            alt={VITE_APP_NAME}
                            className={
                                info?.logo
                                    ? 'max-w-full max-h-32 object-contain rounded-xl'
                                    : 'w-32 h-32 rounded-xl'
                            }
                        />
                        {info?.name && (
                            <span className="text-xl font-bold leading-tight">
                                {info.name}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {info?.description && (
                        <span className="text-sm text-muted-foreground">
                            {info?.description}
                        </span>
                    )}

                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            onConnectClick();
                        }}
                    >
                        <Group
                            label="Identity"
                            help="A username you would like to login with. You can edit your display name later."
                        >
                            <Input
                                {...r('identity')}
                                autoComplete="username"
                                onEnter={onConnectClick}
                                data-testid={TestId.CONNECT_IDENTITY_INPUT}
                            />
                        </Group>
                        <Group label="Password">
                            <Input
                                {...r('password')}
                                type="password"
                                autoComplete={
                                    isSignup
                                        ? 'new-password'
                                        : 'current-password'
                                }
                                onEnter={onConnectClick}
                                data-testid={TestId.CONNECT_PASSWORD_INPUT}
                            />
                        </Group>
                        {isSignup && (
                            <Group
                                label="Confirm password"
                                help="Type your password again so you don't lock yourself out."
                            >
                                <Input
                                    {...r('confirmPassword')}
                                    type="password"
                                    autoComplete="new-password"
                                    onEnter={onConnectClick}
                                />
                            </Group>
                        )}
                    </form>

                    <div
                        className="flex items-center gap-2 w-fit cursor-pointer"
                        data-testid={TestId.CONNECT_AUTO_LOGIN_SWITCH}
                        onClick={() => {
                            onChange('autoLogin', !values.autoLogin);
                        }}
                    >
                        <Switch checked={values.autoLogin} />
                        <span className="text-sm font-medium cursor-pointer">
                            Login automatically
                        </span>
                    </div>

                    <div className="flex flex-col gap-2">
                        {!window.isSecureContext ? (
                            <Alert variant="destructive">
                                <AlertTitle>Insecure Connection</AlertTitle>
                                <AlertDescription>
                                    You are accessing the server over an
                                    insecure connection (HTTP). By default,
                                    browsers block access to media devices such
                                    as your camera and microphone on insecure
                                    origins. This means that you won't be able
                                    to use video or voice chat features while
                                    connected to the server over HTTP. If you
                                    are the server administrator, you can set up
                                    HTTPS by following the instructions in the
                                    documentation.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-green-500">
                                <ShieldCheck size={16} />
                                <span>Secure connection</span>
                            </div>
                        )}

                        <Button
                            className="w-full"
                            variant="outline"
                            onClick={onConnectClick}
                            disabled={
                                loading ||
                                !values.identity ||
                                !values.password ||
                                passwordMismatch
                            }
                            data-testid={TestId.CONNECT_BUTTON}
                        >
                            {isSignup ? 'Create account' : 'Connect'}
                        </Button>

                        {!isSignup && (
                            <span className="text-xs text-muted-foreground text-center">
                                Sign in with an existing account. Or ask for an
                                invite.
                            </span>
                        )}

                        {isSignup && (
                            <Alert variant="info">
                                <AlertTitle>
                                    You were invited to join this server
                                </AlertTitle>
                                <AlertDescription>
                                    <span className="font-mono text-xs">
                                        Invite code: {inviteCode}
                                    </span>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});

export { Connect };
