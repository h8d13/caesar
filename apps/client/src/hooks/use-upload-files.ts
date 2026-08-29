import { useChannelById } from '@/features/server/channels/hooks';
import { useCan, usePublicServerSettings } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { uploadFile, type TUploadProgress } from '@/helpers/upload-file';
import { dmKey, hasPriv } from '@/lib/e2ee';
import { useDmE2eeContext } from '@/lib/use-dm-e2ee';
import { isPreviewable, Permission, type TTempFile } from '@caesar/shared';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type RefObject
} from 'react';
import { toast } from 'sonner';

type TDisplayItem = {
    id: string;
    name: string;
    size: number;
    extension: string;
    previewUrl?: string;
    progress?: number;
    file?: TTempFile;
};

const useUploadFiles = (
    channelId: number,
    containerRef: RefObject<HTMLElement | null>,
    disabled: boolean = false
) => {
    const [files, setFiles] = useState<TTempFile[]>([]);
    const filesRef = useRef<TTempFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadingSize, setUploadingSize] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const loadedPerFileRef = useRef<Record<string, number>>({});
    const totalLoadedRef = useRef(0);
    const speedSampleRef = useRef<{ time: number; loaded: number }>({
        time: 0,
        loaded: 0
    });
    const [pendingUploads, setPendingUploads] = useState<TDisplayItem[]>([]);
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
    const previewUrlsRef = useRef<Record<string, string>>({});
    const [displayOrder, setDisplayOrder] = useState<string[]>([]);
    const settings = usePublicServerSettings();
    const selectedChannel = useChannelById(channelId);
    const can = useCan();

    const isDmChannel = !!selectedChannel?.isDm;

    const canShareFilesInDirectMessages =
        !isDmChannel || !!settings?.storageFileSharingInDirectMessages;

    // ephemeral DM attachments piggyback on the same E2EE context as
    // message content. resolve a per-upload key lazily so the dialog
    // can sit idle without paying argon2 / ECDH costs.
    const e2eeCtx = useDmE2eeContext(channelId, isDmChannel);
    const ownUserId = useOwnUserId();

    const getAttachmentEncryptKey = useCallback(async (): Promise<
        CryptoKey | undefined
    > => {
        if (
            !isDmChannel ||
            !e2eeCtx ||
            e2eeCtx.ephemeralMs == null ||
            !hasPriv() ||
            !e2eeCtx.peerPublicKey ||
            e2eeCtx.peerUserId === null ||
            ownUserId === undefined
        ) {
            return undefined;
        }
        try {
            return await dmKey(
                e2eeCtx.peerPublicKey,
                ownUserId,
                e2eeCtx.peerUserId
            );
        } catch (err) {
            console.error('e2ee dmKey derivation failed for upload', err);
            return undefined;
        }
    }, [isDmChannel, e2eeCtx, ownUserId]);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => {
        previewUrlsRef.current = previewUrls;
    }, [previewUrls]);

    const takeAllowedFiles = useCallback(
        (filesToUpload: File[]) => {
            const maxFilesPerMessage =
                settings?.storageMaxFilesPerMessage ?? Number.MAX_SAFE_INTEGER;
            const remainingSlots = maxFilesPerMessage - filesRef.current.length;

            if (remainingSlots <= 0) {
                toast.warning(
                    `Maximum attachments reached (${maxFilesPerMessage} per message).`
                );
                return [];
            }

            if (filesToUpload.length > remainingSlots) {
                const discardedCount = filesToUpload.length - remainingSlots;

                toast.warning(
                    `${discardedCount} file${discardedCount > 1 ? 's were' : ' was'} ignored due to the per-message attachment limit.`
                );
            }

            return filesToUpload.slice(0, remainingSlots);
        },
        [settings?.storageMaxFilesPerMessage]
    );

    const removeFile = useCallback((id: string) => {
        setFiles((prevFiles) => prevFiles.filter((file) => file.id !== id));
        setDisplayOrder((prev) => prev.filter((orderId) => orderId !== id));

        const url = previewUrlsRef.current[id];

        if (url) {
            URL.revokeObjectURL(url);

            setPreviewUrls((prev) => {
                const next = { ...prev };

                delete next[id];

                return next;
            });
        }
    }, []);

    const clearFiles = useCallback(() => {
        for (const url of Object.values(previewUrlsRef.current)) {
            URL.revokeObjectURL(url);
        }

        setFiles([]);
        setPendingUploads([]);
        setPreviewUrls({});
        setDisplayOrder([]);
        setUploading(false);
        setUploadingSize(0);
        setUploadSpeed(0);
        loadedPerFileRef.current = {};
        totalLoadedRef.current = 0;
    }, []);

    const checkUploadPermissions = useCallback(() => {
        if (disabled) return false;

        if (!settings?.storageUploadEnabled) {
            toast.warning('File uploads are disabled on this server.');

            return false;
        }

        if (!canShareFilesInDirectMessages) {
            toast.warning(
                'File sharing in direct messages is disabled on this server.'
            );

            return false;
        }

        if (!can(Permission.UPLOAD_FILES)) {
            toast.error('You do not have permission to upload files.');

            return false;
        }

        return true;
    }, [
        disabled,
        settings?.storageUploadEnabled,
        canShareFilesInDirectMessages,
        can
    ]);

    const openFileDialog = useCallback(() => {
        if (!checkUploadPermissions()) return;

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    }, [checkUploadPermissions]);

    const processFiles = useCallback(
        async (filesToUpload: File[]) => {
            const allowed = takeAllowedFiles(filesToUpload);

            if (!allowed.length) return;

            const maxFileSize =
                settings?.storageUploadMaxFileSize ?? Number.MAX_SAFE_INTEGER;
            const withinLimit: File[] = [];

            for (const file of allowed) {
                if (file.size > maxFileSize) {
                    toast.error(
                        `"${file.name}" exceeds the maximum file size limit.`
                    );
                } else {
                    withinLimit.push(file);
                }
            }

            if (!withinLimit.length) return;

            setUploading(true);
            setUploadSpeed(0);

            speedSampleRef.current = { time: Date.now(), loaded: 0 };
            loadedPerFileRef.current = {};
            totalLoadedRef.current = 0;

            const total = withinLimit.reduce((acc, file) => acc + file.size, 0);

            setUploadingSize((size) => size + total);

            const pendingEntries: TDisplayItem[] = withinLimit.map(
                (file, i) => {
                    const parts = file.name.split('.');
                    const ext = parts.length > 1 ? `.${parts.pop()}` : '';

                    return {
                        id: `pending-${Date.now()}-${i}`,
                        name: file.name,
                        size: file.size,
                        extension: ext,
                        previewUrl: isPreviewable(file)
                            ? URL.createObjectURL(file)
                            : undefined,
                        progress: 0
                    };
                }
            );

            setPendingUploads((prev) => [...prev, ...pendingEntries]);
            setDisplayOrder((prev) => [
                ...prev,
                ...pendingEntries.map((p) => p.id)
            ]);

            // resolve once per batch so each parallel upload shares the
            // same dmKey instead of paying ECDH N times.
            const encryptKey = await getAttachmentEncryptKey();

            const uploadPromises = withinLimit.map(async (file, i) => {
                const pendingId = pendingEntries[i].id;

                const onProgress = (progress: TUploadProgress) => {
                    setPendingUploads((prev) =>
                        prev.map((p) =>
                            p.id === pendingId
                                ? { ...p, progress: progress.percent }
                                : p
                        )
                    );

                    const prevLoaded = loadedPerFileRef.current[pendingId] ?? 0;

                    loadedPerFileRef.current[pendingId] = progress.loaded;
                    totalLoadedRef.current += progress.loaded - prevLoaded;

                    const now = Date.now();
                    const sample = speedSampleRef.current;
                    const elapsed = now - sample.time;

                    if (elapsed >= 500) {
                        const bytesPerSec =
                            ((totalLoadedRef.current - sample.loaded) /
                                elapsed) *
                            1000;

                        setUploadSpeed(bytesPerSec);

                        speedSampleRef.current = {
                            time: now,
                            loaded: totalLoadedRef.current
                        };
                    }
                };

                const result = await uploadFile(file, {
                    onProgress,
                    encryptKey
                });

                setPendingUploads((prev) =>
                    prev.filter((p) => p.id !== pendingId)
                );

                if (!result) {
                    const previewUrl = pendingEntries[i].previewUrl;

                    if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                    }

                    setDisplayOrder((prev) =>
                        prev.filter((id) => id !== pendingId)
                    );

                    return;
                }

                const previewUrl = pendingEntries[i].previewUrl;

                if (previewUrl) {
                    setPreviewUrls((prev) => ({
                        ...prev,
                        [result.id]: previewUrl
                    }));
                }

                setDisplayOrder((prev) =>
                    prev.map((id) => (id === pendingId ? result.id : id))
                );

                setFiles((prev) => [...prev, result]);
            });

            await Promise.all(uploadPromises);

            setUploading(false);
            setUploadingSize((size) => size - total);
            setUploadSpeed(0);
            loadedPerFileRef.current = {};
            totalLoadedRef.current = 0;
        },
        [
            takeAllowedFiles,
            settings?.storageUploadMaxFileSize,
            getAttachmentEncryptKey
        ]
    );

    const onFileDialogChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const list = event.currentTarget.files;

            if (!list || list.length === 0) return;

            await processFiles(Array.from(list));
        },
        [processFiles]
    );

    useEffect(() => {
        const container = containerRef.current;

        if (!container || !settings?.storageUploadEnabled || disabled) return;

        const handlePaste = async (event: ClipboardEvent) => {
            const items = event.clipboardData?.items ?? [];
            const hasFiles = Array.from(items).some(
                (item) => item.kind === 'file'
            );

            if (hasFiles && !checkUploadPermissions()) return;

            const filesToUpload: File[] = [];

            for (let i = 0; i < items.length; i++) {
                if (items[i].kind !== 'file') continue;

                const pastedFile = items[i].getAsFile();

                if (!pastedFile) continue;

                filesToUpload.push(pastedFile);
            }

            await processFiles(filesToUpload);
        };

        const handleDrop = async (event: DragEvent) => {
            event.preventDefault();

            const items = event.dataTransfer?.items ?? [];
            const dFiles = event.dataTransfer?.files ?? [];
            const hasFiles =
                Array.from(items).some((item) => item.kind === 'file') ||
                dFiles.length > 0;

            if (hasFiles && !checkUploadPermissions()) return;

            const filesToUpload: File[] = [];

            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile();

                        if (file) filesToUpload.push(file);
                    }
                }
            } else {
                for (let i = 0; i < dFiles.length; i++) {
                    filesToUpload.push(dFiles[i]);
                }
            }

            await processFiles(filesToUpload);
        };

        const handleDragOver = (event: DragEvent) => {
            event.preventDefault();
        };

        container.addEventListener('paste', handlePaste);
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);

        return () => {
            container.removeEventListener('paste', handlePaste);
            container.removeEventListener('dragover', handleDragOver);
            container.removeEventListener('drop', handleDrop);
        };
    }, [
        checkUploadPermissions,
        settings?.storageUploadEnabled,
        disabled,
        containerRef,
        processFiles
    ]);

    const fileInputProps = useMemo(
        () => ({
            ref: fileInputRef,
            type: 'file' as const,
            multiple: true,
            onChange: onFileDialogChange,
            style: { display: 'none' }
        }),
        [onFileDialogChange]
    );

    const pendingMap = useMemo(() => {
        const map = new Map<string, TDisplayItem>();

        for (const p of pendingUploads) {
            map.set(p.id, p);
        }

        return map;
    }, [pendingUploads]);

    const filesMap = useMemo(() => {
        const map = new Map<string, TTempFile>();

        for (const f of files) {
            map.set(f.id, f);
        }

        return map;
    }, [files]);

    const displayItems: TDisplayItem[] = useMemo(() => {
        const items: TDisplayItem[] = [];

        for (const id of displayOrder) {
            const file = filesMap.get(id);

            if (file) {
                items.push({
                    id: file.id,
                    name: file.originalName,
                    size: file.size,
                    extension: file.extension,
                    previewUrl: previewUrls[id],
                    file
                });

                continue;
            }

            const pending = pendingMap.get(id);

            if (pending) {
                items.push(pending);
            }
        }

        return items;
    }, [displayOrder, filesMap, pendingMap, previewUrls]);

    return useMemo(
        () => ({
            files,
            displayItems,
            removeFile,
            clearFiles,
            uploading,
            uploadingSize,
            uploadSpeed,
            openFileDialog,
            fileInputProps,
            // for callers that produce a File without a dialog, paste or
            // drop (voice recordings). permission gating stays with the
            // caller, same as the three paths above.
            addFiles: processFiles
        }),
        [
            files,
            displayItems,
            removeFile,
            clearFiles,
            uploading,
            uploadingSize,
            uploadSpeed,
            openFileDialog,
            fileInputProps,
            processFiles
        ]
    );
};

export { useUploadFiles, type TDisplayItem };
