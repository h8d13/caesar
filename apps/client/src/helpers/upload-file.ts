import { UploadHeaders, type TTempFile } from '@caesar/shared';
import { toast } from 'sonner';
import { sealStreamed } from '../lib/e2ee';
import { getUrlFromServer } from './get-file-url';
import { getSessionStorageItem, SessionStorageKey } from './storage';

const getSafeFileName = (name: string) =>
    encodeURIComponent(name.replace(/[^\w.-]/g, '_'));

type TUploadProgress = {
    loaded: number;
    total: number;
    percent: number;
};

type TUploadFileOptions = {
    onProgress?: (progress: TUploadProgress) => void;
    // when set, encrypt the file bytes with AES-GCM under this key before
    // upload. server stores ciphertext opaquely; the matching openBytes
    // call on the renderer side restores the original payload.
    encryptKey?: CryptoKey;
};

const uploadFile = async (
    file: File,
    options?: TUploadFileOptions
): Promise<TTempFile | undefined> => {
    const url = getUrlFromServer();

    let body: BodyInit = file;
    let contentLength = file.size;

    if (options?.encryptKey) {
        try {
            // streamed: only ~1 MB of plaintext in memory at a time, no
            // 256 MB AES-GCM single-call limit, multi-GB files supported.
            const sealed = await sealStreamed(options.encryptKey, file);
            body = sealed;
            contentLength = sealed.size;
        } catch (e) {
            console.error('e2ee file seal failed', e);
            toast.error('Could not encrypt file.');
            return undefined;
        }
    }

    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.open('POST', `${url}/upload`);

        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader(UploadHeaders.TYPE, file.type);
        xhr.setRequestHeader(
            UploadHeaders.CONTENT_LENGTH,
            contentLength.toString()
        );
        xhr.setRequestHeader(
            UploadHeaders.ORIGINAL_NAME,
            getSafeFileName(file.name)
        );
        xhr.setRequestHeader(
            UploadHeaders.TOKEN,
            getSessionStorageItem(SessionStorageKey.TOKEN) ?? ''
        );

        if (options?.onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    options.onProgress!({
                        loaded: e.loaded,
                        total: e.total,
                        percent: Math.round((e.loaded / e.total) * 100)
                    });
                }
            });
        }

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText) as TTempFile);
            } else {
                try {
                    const errorData = JSON.parse(xhr.responseText);

                    toast.error(errorData.error || xhr.statusText);
                } catch {
                    toast.error(xhr.statusText);
                }

                resolve(undefined);
            }
        });

        xhr.addEventListener('error', () => {
            toast.error('Upload failed');
            resolve(undefined);
        });

        xhr.send(body);
    });
};

const uploadFiles = async (
    files: File[],
    onProgress?: (fileIndex: number, progress: TUploadProgress) => void
) => {
    const uploadedFiles: TTempFile[] = [];

    for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFile(files[i], {
            onProgress: onProgress
                ? (progress) => onProgress(i, progress)
                : undefined
        });

        if (!uploadedFile) continue;

        uploadedFiles.push(uploadedFile);
    }

    return uploadedFiles;
};

export { uploadFile, uploadFiles, type TUploadProgress };
