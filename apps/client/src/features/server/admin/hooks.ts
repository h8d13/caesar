import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import {
    DELETED_USER_IDENTITY_AND_NAME,
    parseTrpcErrors,
    STORAGE_DEFAULT_MAX_AVATAR_SIZE,
    STORAGE_DEFAULT_MAX_BANNER_SIZE,
    STORAGE_DEFAULT_MAX_FILES_PER_MESSAGE,
    STORAGE_MAX_FILE_SIZE,
    STORAGE_MAX_QUOTA_PER_USER,
    STORAGE_OVERFLOW_ACTION,
    STORAGE_QUOTA,
    StorageOverflowAction,
    type TCategory,
    type TChannel,
    type TStorageSettings,
    type TTrpcErrors
} from '@caesar/shared';
import { useQuery, type QueryObserverResult } from '@tanstack/react-query';
import { filesize } from 'filesize';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const toVoid =
    <T>(refetch: () => Promise<QueryObserverResult<T, Error>>) =>
    async (): Promise<void> => {
        await refetch();
    };

export const useAdminGeneral = () => {
    const [errors, setErrors] = useState<TTrpcErrors>({});
    const [settings, setSettings] = useState({
        name: '',
        description: '',
        directMessagesEnabled: true,
        gamesEnabled: true
    });

    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'settings'],
        queryFn: () => getTRPCClient().others.getSettings.query()
    });

    // form state initialized from server data
    useEffect(() => {
        if (!data) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server data into editable form state on (re)fetch
        setSettings({
            name: data.name,
            description: data.description ?? '',
            directMessagesEnabled: data.directMessagesEnabled ?? true,
            gamesEnabled: data.gamesEnabled ?? true
        });
    }, [data]);

    const submit = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.others.updateSettings.mutate({
                name: settings.name,
                description: settings.description,
                directMessagesEnabled: settings.directMessagesEnabled,
                gamesEnabled: settings.gamesEnabled
            });
            // refresh the cached query so reopening settings reflects what was
            // saved (staleTime is 30s, so the cache would otherwise serve the
            // pre-save value and the toggles would appear reverted).
            await refetch();
            toast.success('Settings updated');
        } catch (error) {
            console.error('Error updating settings:', error);
            setErrors(parseTrpcErrors(error));
        }
    }, [settings, refetch]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChange = useCallback((field: keyof typeof settings, value: any) => {
        setSettings((s) => ({ ...s, [field]: value }));
        setErrors((e) => ({ ...e, [field]: undefined }));
    }, []);

    return {
        settings,
        refetch: toVoid(refetch),
        loading,
        submit,
        errors,
        onChange,
        logo: data?.logo ?? null
    };
};

export const useAdminChannelGeneral = (channelId: number) => {
    const [errors, setErrors] = useState<TTrpcErrors>({});
    const [channel, setChannel] = useState<TChannel | undefined>(undefined);

    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'channel', channelId],
        queryFn: () => getTRPCClient().channels.get.query({ channelId })
    });

    // form state initialized from server data
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server data into editable form state on (re)fetch
        if (data) setChannel(data);
    }, [data]);

    const submit = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.channels.update.mutate({
                channelId,
                name: channel?.name ?? '',
                topic: channel?.topic ?? null,
                private: channel?.private ?? false
            });

            toast.success('Channel updated');
        } catch (error) {
            console.error('Error updating channel:', error);
            setErrors(parseTrpcErrors(error));
        }
    }, [channel, channelId]);

    const onChange = useCallback(
        (field: keyof TChannel, value: string | null | boolean) => {
            if (!channel) return;
            setChannel((c) => (c ? { ...c, [field]: value } : c));
            setErrors((e) => ({ ...e, [field]: undefined }));
        },
        [channel]
    );

    return {
        channel,
        refetch: toVoid(refetch),
        loading,
        errors,
        onChange,
        submit
    };
};

export const useAdminCategoryGeneral = (categoryId: number) => {
    const [errors, setErrors] = useState<TTrpcErrors>({});
    const [category, setCategory] = useState<TCategory | undefined>(undefined);

    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'category', categoryId],
        queryFn: () => getTRPCClient().categories.get.query({ categoryId })
    });

    // form state initialized from server data
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server data into editable form state on (re)fetch
        if (data) setCategory(data);
    }, [data]);

    const submit = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.categories.update.mutate({
                categoryId,
                name: category?.name ?? ''
            });

            toast.success('Category updated');
        } catch (error) {
            console.error('Error updating category:', error);
            setErrors(parseTrpcErrors(error));
        }
    }, [category, categoryId]);

    const onChange = useCallback(
        (field: keyof TCategory, value: string | null) => {
            if (!category) return;
            setCategory((c) => (c ? { ...c, [field]: value } : c));
            setErrors((e) => ({ ...e, [field]: undefined }));
        },
        [category]
    );

    return {
        category,
        refetch: toVoid(refetch),
        loading,
        errors,
        onChange,
        submit
    };
};

export const useAdminEmojis = () => {
    const [errors, setErrors] = useState<TTrpcErrors>({});

    const {
        data: emojis = [],
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'emojis'],
        queryFn: () => getTRPCClient().emojis.getAll.query()
    });

    const onChange = useCallback(() => {
        setErrors({});
    }, []);

    return {
        emojis,
        refetch: toVoid(refetch),
        loading,
        errors,
        onChange
    };
};

export const useAdminSounds = () => {
    const [errors, setErrors] = useState<TTrpcErrors>({});

    const {
        data: sounds = [],
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'sounds'],
        queryFn: () => getTRPCClient().sounds.getAll.query()
    });

    const onChange = useCallback(() => {
        setErrors({});
    }, []);

    return {
        sounds,
        refetch: toVoid(refetch),
        loading,
        errors,
        onChange
    };
};

export const useAdminRoles = () => {
    const [errors, setErrors] = useState<TTrpcErrors>({});

    const {
        data: roles = [],
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'roles'],
        queryFn: () => getTRPCClient().roles.getAll.query()
    });

    const onChange = useCallback(() => {
        setErrors({});
    }, []);

    return {
        roles,
        refetch: toVoid(refetch),
        loading,
        errors,
        onChange
    };
};

export const useAdminStorage = () => {
    const { values, setValues, setTrpcErrors, r, onChange } =
        useForm<TStorageSettings>({
            storageOverflowAction: STORAGE_OVERFLOW_ACTION,
            storageSpaceQuotaByUser: STORAGE_MAX_QUOTA_PER_USER,
            storageFileSharingInDirectMessages: true,
            storageUploadEnabled: true,
            storageUploadMaxFileSize: STORAGE_MAX_FILE_SIZE,
            storageMaxAvatarSize: STORAGE_DEFAULT_MAX_AVATAR_SIZE,
            storageMaxBannerSize: STORAGE_DEFAULT_MAX_BANNER_SIZE,
            storageMaxFilesPerMessage: STORAGE_DEFAULT_MAX_FILES_PER_MESSAGE,
            storageQuota: STORAGE_QUOTA
        });

    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'storage'],
        queryFn: () => getTRPCClient().others.getStorageSettings.query()
    });

    // form state initialized from server data
    useEffect(() => {
        if (data) setValues(data.storageSettings);
    }, [data, setValues]);

    const submit = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.others.updateSettings.mutate({
                storageUploadEnabled: values.storageUploadEnabled,
                storageFileSharingInDirectMessages:
                    values.storageFileSharingInDirectMessages,
                storageQuota: values.storageQuota,
                storageUploadMaxFileSize: values.storageUploadMaxFileSize,
                storageMaxAvatarSize: values.storageMaxAvatarSize,
                storageMaxBannerSize: values.storageMaxBannerSize,
                storageMaxFilesPerMessage: values.storageMaxFilesPerMessage,
                storageSpaceQuotaByUser: values.storageSpaceQuotaByUser,
                storageOverflowAction:
                    values.storageOverflowAction as StorageOverflowAction
            });
            // keep the cache in sync with the DB (staleTime 30s) so reopening
            // storage settings shows the saved values, not the pre-save cache.
            await refetch();
            toast.success('Storage settings updated');
        } catch (error) {
            console.error('Error updating storage settings:', error);
            setTrpcErrors(error);
        }
    }, [values, setTrpcErrors, refetch]);

    const labels = useMemo(() => {
        return {
            storageUploadMaxFileSize: filesize(
                Number(values.storageUploadMaxFileSize ?? 0),
                {
                    output: 'object',
                    standard: 'jedec'
                }
            ),
            storageSpaceQuotaByUser: filesize(
                Number(values.storageSpaceQuotaByUser ?? 0),
                {
                    output: 'object',
                    standard: 'jedec'
                }
            ),
            storageQuota: filesize(Number(values.storageQuota ?? 0), {
                output: 'object',
                standard: 'jedec'
            }),
            storageMaxAvatarSize: filesize(
                Number(values.storageMaxAvatarSize ?? 0),
                {
                    output: 'object',
                    standard: 'jedec'
                }
            ),
            storageMaxBannerSize: filesize(
                Number(values.storageMaxBannerSize ?? 0),
                {
                    output: 'object',
                    standard: 'jedec'
                }
            )
        };
    }, [values]);

    return {
        values,
        labels,
        refetch: toVoid(refetch),
        loading,
        submit,
        r,
        onChange,
        diskMetrics: data?.diskMetrics
    };
};

export const useAdminUsers = () => {
    const {
        data: users = [],
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'users'],
        queryFn: async () => {
            const all = await getTRPCClient().users.getAll.query();
            return all.filter((u) => u.name !== DELETED_USER_IDENTITY_AND_NAME);
        }
    });

    return {
        users,
        refetch: toVoid(refetch),
        loading
    };
};

export const useAdminChannelPermissions = (channelId: number) => {
    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'channel-permissions', channelId],
        queryFn: () =>
            getTRPCClient().channels.getPermissions.mutate({ channelId })
    });

    return {
        rolePermissions: data?.rolePermissions ?? [],
        userPermissions: data?.userPermissions ?? [],
        refetch: toVoid(refetch),
        loading
    };
};

export const useAdminUserInfo = (userId: number) => {
    const {
        data,
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'user-info', userId],
        queryFn: () => getTRPCClient().users.getInfo.query({ userId })
    });

    return {
        user: data?.user ?? null,
        lastLoginIp: data?.lastLoginIp ?? null,
        files: data?.files ?? [],
        messages: data?.messages ?? [],
        storage: data?.storage ?? {
            userId,
            fileCount: 0,
            usedStorage: 0,
            quota: 0
        },
        refetch: toVoid(refetch),
        loading
    };
};

export const useAdminInvites = () => {
    const {
        data: invites = [],
        isPending: loading,
        refetch
    } = useQuery({
        queryKey: ['admin', 'invites'],
        queryFn: () => getTRPCClient().invites.getAll.query()
    });

    const { data: limits, refetch: refetchLimits } = useQuery({
        queryKey: ['admin', 'invites', 'limits'],
        queryFn: () => getTRPCClient().invites.getLimits.query()
    });

    const refetchAll = useCallback(async () => {
        await Promise.all([refetch(), refetchLimits()]);
    }, [refetch, refetchLimits]);

    return {
        invites,
        limits,
        refetch: refetchAll,
        loading
    };
};
