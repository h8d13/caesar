import { useInfo } from '@/features/server/hooks';
import { ensureAudioCtxReady } from '@/features/server/sounds/actions';
import { getFileUrl, getUrlFromServer } from '@/helpers/get-file-url';
import {
    getLocalStorageItemBool,
    LocalStorageKey,
    setLocalStorageItemBool
} from '@/helpers/storage';
import { useForm } from '@/hooks/use-form';
import { cn } from '@/lib/utils';
import {
    PASSWORD_LENGTH_ERROR,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    TestId
} from '@caesar/shared';
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
    Switch,
    Tabs,
    TabsList,
    TabsTrigger
} from '@caesar/ui';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { startAuthentication } from '@simplewebauthn/browser';
import {
    Eye,
    EyeClosed,
    KeyRound,
    ShieldAlert,
    ShieldCheck
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type TConnectMode = 'sign-in' | 'sign-up';

// tRPC, the e2ee crypto and the server subscriptions only matter once a
// login succeeds, so the page an anonymous visitor loads ships without
// them. Started on submit, alongside /login, so it rarely adds a wait.
const loadSessionModules = () =>
    Promise.all([import('@/lib/e2ee'), import('@/features/server/actions')]);

// An invite link (/?invite=CODE) only seeds the Sign up form. The param is
// dropped from the address bar once read, so a bookmark of this page is
// plain Sign in and nobody signs up again from a saved invite.
const readInviteParam = () =>
    new URLSearchParams(window.location.search).get('invite') ?? '';

type TSecretInputProps = React.ComponentProps<typeof Input> & {
    // aria label noun: "Show <label>" / "Hide <label>"
    label: string;
    // invite code: a plain field masked with CSS, since type=password would
    // make password managers save or fill it as the account password
    maskWithCss?: boolean;
};

// Hidden by default (streams, screenshares), revealed on demand.
const SecretInput = memo(
    ({ label, maskWithCss, className, ...props }: TSecretInputProps) => {
        const [shown, setShown] = useState(false);

        return (
            // toggle sits inside the field: pinned to the input's own h-9 row
            // so a validation message below doesn't shift it
            <div className="relative">
                <Input
                    {...props}
                    type={maskWithCss || shown ? 'text' : 'password'}
                    className={cn(
                        'pr-9',
                        maskWithCss && !shown && '[-webkit-text-security:disc]',
                        className
                    )}
                />
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:bg-transparent"
                    aria-label={`${shown ? 'Hide' : 'Show'} ${label}`}
                    onClick={() => setShown(!shown)}
                >
                    {shown ? (
                        <EyeClosed className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </Button>
            </div>
        );
    }
);

const Connect = memo(() => {
    const [linkInvite] = useState(readInviteParam);
    const [mode, setMode] = useState<TConnectMode>(
        linkInvite ? 'sign-up' : 'sign-in'
    );
    const { values, r, setErrors, onChange } = useForm<{
        identity: string;
        password: string;
        confirmPassword: string;
        invite: string;
        autoLogin: boolean;
    }>({
        identity: '',
        password: '',
        confirmPassword: '',
        invite: linkInvite,
        autoLogin: getLocalStorageItemBool(LocalStorageKey.AUTO_LOGIN)
    });

    const [loading, setLoading] = useState(false);
    const [pending2fa, setPending2fa] = useState<{
        preAuthToken: string;
        options: PublicKeyCredentialRequestOptionsJSON;
        priv: Uint8Array;
    } | null>(null);
    const info = useInfo();

    // Invite-only server: the server signs up an unknown identity only when
    // an invite comes along, so Sign in never sends one.
    const isSignup = mode === 'sign-up';
    const inviteCode = isSignup ? values.invite.trim() : '';
    const passwordMismatch =
        isSignup && values.confirmPassword !== values.password;

    useEffect(() => {
        if (!linkInvite) return;

        const url = new URL(window.location.href);

        url.searchParams.delete('invite');
        window.history.replaceState(window.history.state, '', url);
    }, [linkInvite]);

    const onModeChange = useCallback(
        (value: string) => {
            setMode(value as TConnectMode);
            // errors from the other mode's submit don't apply after a switch
            setErrors({});
        },
        [setErrors]
    );

    // Runs once /login (password-only) or /login/2fa has set the HttpOnly
    // session cookie. The token itself never reaches this code.
    const completeLogin = useCallback(
        async (priv: Uint8Array) => {
            const [{ persistSessionKey, setPriv }, { connect }] =
                await loadSessionModules();

            // E2EE: set before connecting so the key is fixed for the
            // whole session (<E2eeKeyRegister /> registers it once
            // joinServer lands).
            setPriv(priv);

            // The toggle only picks the cookie's lifetime (sent as remember):
            // persistent, or gone when the browser closes. Either way other
            // tabs and reloads resume it via AutoLoginController.
            setLocalStorageItemBool(
                LocalStorageKey.AUTO_LOGIN,
                values.autoLogin
            );
            setLocalStorageItemBool(LocalStorageKey.HAS_SESSION, true);

            // lets a resumed session unlock ephemeral DMs; on failure it
            // just stays locked
            await persistSessionKey().catch(() => {});

            await connect();
        },
        [values.autoLogin]
    );

    const onConnectClick = useCallback(async () => {
        // Pre-warm the AudioContext inside this gesture stack so
        // event-driven sounds (incoming-call ring, msg pings) can play
        // later without the browser keeping the context suspended.
        ensureAudioCtxReady();
        void loadSessionModules().catch(() => {
            // completeLogin awaits it again and reports the failure
        });

        if (isSignup && values.password !== values.confirmPassword) {
            setErrors({
                confirmPassword: 'Passwords do not match'
            });
            return;
        }

        if (
            values.password.length < PASSWORD_MIN_LENGTH ||
            values.password.length > PASSWORD_MAX_LENGTH
        ) {
            setErrors({ password: PASSWORD_LENGTH_ERROR });
            return;
        }

        setLoading(true);

        try {
            const [{ deriveCredentials }] = await loadSessionModules();

            // argon2id runs in a Web Worker, so the spinner stays
            // responsive. Only authKey leaves this browser.
            const { priv, authKey } = await deriveCredentials(
                values.password,
                values.identity
            );

            const url = getUrlFromServer();
            const response = await fetch(`${url}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: values.identity,
                    authKey,
                    invite: inviteCode || undefined,
                    remember: values.autoLogin
                })
            });

            // Burst limit and failed-login lockout reply 429 with a plain
            // { error } body rather than per-field errors.
            if (response.status === 429) {
                const data = await response.json().catch(() => ({}));

                setErrors({
                    identity:
                        data.error ||
                        'Too many attempts. Please try again later.'
                });
                return;
            }

            if (!response.ok) {
                const data = await response.json();

                setErrors(data.errors || {});
                return;
            }

            const data = (await response.json()) as
                | { success: true }
                | {
                      needs2fa: true;
                      preAuthToken: string;
                      options: PublicKeyCredentialRequestOptionsJSON;
                  };

            if ('needs2fa' in data) {
                setPending2fa({
                    preAuthToken: data.preAuthToken,
                    options: data.options,
                    priv
                });
                return;
            }

            await completeLogin(priv);
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
        inviteCode,
        completeLogin
    ]);

    const onTapKeyClick = useCallback(async () => {
        if (!pending2fa) return;

        setLoading(true);

        try {
            const assertion = await startAuthentication({
                optionsJSON: pending2fa.options
            });

            const url = getUrlFromServer();
            const response = await fetch(`${url}/login/2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preAuthToken: pending2fa.preAuthToken,
                    response: assertion
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                const message =
                    errData.errors?.preAuthToken ||
                    errData.errors?.response ||
                    errData.error ||
                    'Two-factor authentication failed.';
                toast.error(message);
                // Burn the preAuthToken; user must re-enter password.
                setPending2fa(null);
                return;
            }

            await completeLogin(pending2fa.priv);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            toast.error(`Key auth failed: ${message}`);
        } finally {
            setLoading(false);
        }
    }, [pending2fa, completeLogin]);

    const logoSrc = useMemo(() => {
        if (info?.logo) {
            return getFileUrl(info.logo);
        }

        return '/logo.png';
    }, [info]);

    return (
        <div className="flex flex-col gap-2 justify-center items-center h-full">
            <Card className="w-full max-w-sm gap-2">
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
                        <span className="text-sm text-muted-foreground text-center">
                            {info?.description}
                        </span>
                    )}

                    {pending2fa ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col items-center gap-3 py-4">
                                <KeyRound
                                    size={48}
                                    className="text-muted-foreground"
                                />
                                <p className="text-sm text-center">
                                    Touch your security key to complete sign-in.
                                </p>
                            </div>
                            <Button
                                className="w-full"
                                onClick={onTapKeyClick}
                                disabled={loading}
                            >
                                {loading ? 'Waiting for key…' : 'Start →'}
                            </Button>
                            <Button
                                className="w-full"
                                variant="ghost"
                                onClick={() => setPending2fa(null)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Tabs value={mode} onValueChange={onModeChange}>
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger
                                        value="sign-in"
                                        data-testid={TestId.CONNECT_SIGN_IN_TAB}
                                    >
                                        Sign in
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="sign-up"
                                        data-testid={TestId.CONNECT_SIGN_UP_TAB}
                                    >
                                        Sign up
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <form
                                className="flex flex-col gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void onConnectClick();
                                }}
                            >
                                {isSignup && (
                                    <Group
                                        label="Invite code"
                                        help="Ask a member of this server for one."
                                    >
                                        <SecretInput
                                            {...r('invite')}
                                            label="invite code"
                                            maskWithCss
                                            autoComplete="off"
                                            spellCheck={false}
                                            onEnter={onConnectClick}
                                            data-testid={
                                                TestId.CONNECT_INVITE_INPUT
                                            }
                                        />
                                    </Group>
                                )}
                                <Group
                                    label="Identity"
                                    help="A username you would like to login with. You can edit your display name later."
                                >
                                    <Input
                                        {...r('identity')}
                                        autoComplete="username"
                                        onEnter={onConnectClick}
                                        data-testid={
                                            TestId.CONNECT_IDENTITY_INPUT
                                        }
                                    />
                                </Group>
                                <Group label="Password">
                                    <SecretInput
                                        {...r('password')}
                                        label="password"
                                        autoComplete={
                                            isSignup
                                                ? 'new-password'
                                                : 'current-password'
                                        }
                                        onEnter={onConnectClick}
                                        data-testid={
                                            TestId.CONNECT_PASSWORD_INPUT
                                        }
                                    />
                                </Group>
                                {isSignup && (
                                    <Group
                                        label="Confirm password"
                                        help="Type your password again so you don't lock yourself out."
                                    >
                                        <SecretInput
                                            {...r('confirmPassword')}
                                            label="confirm password"
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
                                    Stay signed in?
                                </span>
                            </div>

                            <div className="flex flex-col gap-2">
                                {!window.isSecureContext ? (
                                    <Alert variant="destructive">
                                        <AlertTitle>
                                            Insecure Connection
                                        </AlertTitle>
                                        <AlertDescription>
                                            You are accessing the server over an
                                            insecure connection (HTTP). By
                                            default, browsers block access to
                                            media devices such as your camera
                                            and microphone on insecure origins.
                                            This means that you won't be able to
                                            use video or voice chat features
                                            while connected to the server over
                                            HTTP. If you are the server
                                            administrator, you can set up HTTPS
                                            by following the instructions in the
                                            documentation.
                                        </AlertDescription>
                                    </Alert>
                                ) : window.location.protocol === 'https:' ? (
                                    <div className="flex items-center gap-2 text-sm text-green-500">
                                        <ShieldCheck size={16} />
                                        <span>Secure connection</span>
                                    </div>
                                ) : (
                                    // secure *context* (localhost/127.0.0.1)
                                    // but not HTTPS: media devices work, yet
                                    // traffic is unencrypted. don't claim
                                    // "secure".
                                    <div className="flex items-center gap-2 text-sm text-amber-500">
                                        <ShieldAlert size={16} />
                                        <span>
                                            Local connection (HTTP, not
                                            encrypted)
                                        </span>
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
                                        passwordMismatch ||
                                        (isSignup && !inviteCode)
                                    }
                                    data-testid={TestId.CONNECT_BUTTON}
                                >
                                    {isSignup ? 'Create account' : 'Sign in'}
                                </Button>

                                <span className="text-xs text-muted-foreground text-center">
                                    {isSignup
                                        ? 'Already have an account? Use Sign in.'
                                        : 'New here? Use Sign up with an invite code.'}
                                </span>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
});

export { Connect };
