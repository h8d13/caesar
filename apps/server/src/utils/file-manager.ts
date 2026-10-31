import {
  StorageOverflowAction,
  type TFile,
  type TTempFile
} from '@caesar/shared';
import { files } from '@caesar/shared/db/schema';
import fs from 'fs/promises';
import mime from 'mime-types';
import path from 'path';
import { db } from '../db';
import { removeFile } from '../db/mutations/files';
import { getExceedingOldFiles, getUsedFileQuota } from '../db/queries/files';
import { getEffectiveStorageSpaceQuotaByUserId } from '../db/queries/roles';
import { getSettings } from '../db/queries/server';
import { getStorageUsageByUserId } from '../db/queries/users';
import { PUBLIC_PATH, TMP_PATH, UPLOADS_PATH } from '../helpers/paths';
import { randomUUIDv7 } from './uuid';

/**
 * Files workflow:
 * 1. User uploads file via HTTP -> stored as temporary file in UPLOADS_PATH
 * 2. addTemporaryFile is called to move file to a managed temporary location in TMP_PATH
 * 3. Temporary file is tracked and auto-deleted after TTL
 * 4. When user confirms/save, saveFile is called to move file to PUBLIC_PATH and create DB entry
 * 5. Storage limits are checked before finalizing save
 */

const TEMP_FILE_TTL = 1000 * 60 * 1; // 1 minute

const moveFile = async (src: string, dest: string) => {
  try {
    await fs.rename(src, dest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
};

// The extension becomes part of the on-disk name and the /public URL, so
// keep only [a-z0-9]: '#' or '?' from the original name would cut the URL.
const getNormalizedExtension = (name: string): string => {
  const extension = path
    .extname(name)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');

  return extension === '.' ? '' : extension;
};

class TemporaryFileManager {
  private temporaryFiles: TTempFile[] = [];
  private timeouts: {
    [id: string]: NodeJS.Timeout;
  } = {};

  public getTemporaryFile = (id: string): TTempFile | undefined => {
    return this.temporaryFiles.find((file) => file.id === id);
  };

  public temporaryFileExists = (id: string): boolean => {
    return this.temporaryFiles.some((file) => file.id === id);
  };

  public temporaryFileHasMimeType = (
    id: string,
    mimeTypePrefix: string
  ): boolean => {
    const tempPath = this.getTemporaryFile(id)?.path;
    if (!tempPath) return false;

    const mimeType = mime.lookup(tempPath) || 'application/octet-stream';
    return mimeType.startsWith(mimeTypePrefix);
  };

  public addTemporaryFile = async ({
    filePath,
    size,
    originalName,
    userId,
    md5
  }: {
    filePath: string;
    size: number;
    originalName: string;
    userId: number;
    // hashed by /upload while it streams the body
    md5: string;
  }): Promise<TTempFile> => {
    const fileId = randomUUIDv7();
    const ext = getNormalizedExtension(originalName);

    const tempFilePath = path.join(TMP_PATH, `${fileId}${ext}`);

    const tempFile: TTempFile = {
      id: fileId,
      originalName,
      size,
      md5,
      path: tempFilePath,
      extension: ext,
      userId
    };

    await moveFile(filePath, tempFile.path);

    this.temporaryFiles.push(tempFile);

    this.timeouts[tempFile.id] = setTimeout(() => {
      // already saved or deleted by the user: nothing left to expire
      this.removeTemporaryFile(tempFile.id).catch(() => {});
    }, TEMP_FILE_TTL);

    return tempFile;
  };

  public removeTemporaryFile = async (
    id: string,
    skipDelete = false
  ): Promise<void> => {
    const tempFile = this.temporaryFiles.find((file) => file.id === id);

    if (!tempFile) {
      throw new Error('Temporary file not found');
    }

    clearTimeout(this.timeouts[id]);

    if (!skipDelete) {
      try {
        await fs.unlink(tempFile.path);
      } catch {
        // ignore
      }
    }

    this.temporaryFiles = this.temporaryFiles.filter((file) => file.id !== id);
  };

  public getSafeUploadPath = async (name: string): Promise<string> => {
    const ext = getNormalizedExtension(name);
    const safePath = path.join(UPLOADS_PATH, `${randomUUIDv7()}${ext}`);

    return safePath;
  };
}

class FileManager {
  private tempFileManager = new TemporaryFileManager();

  public getSafeUploadPath = this.tempFileManager.getSafeUploadPath;

  public addTemporaryFile = this.tempFileManager.addTemporaryFile;

  public removeTemporaryFile = this.tempFileManager.removeTemporaryFile;

  public getTemporaryFile = this.tempFileManager.getTemporaryFile;
  public temporaryFileExists = this.tempFileManager.temporaryFileExists;
  public temporaryFileHasMimeType =
    this.tempFileManager.temporaryFileHasMimeType;

  // Looks up and quota-checks the whole batch from one usage snapshot,
  // walking files in order with running totals: errors and evictions match
  // saving them one by one, without re-reading usage per file. Throws
  // before any file is moved, so a rejected batch leaves no orphans.
  private resolveBatch = async (
    tempFileIds: string[],
    userId: number
  ): Promise<TTempFile[]> => {
    const [settings, userStorage, serverStorage] = await Promise.all([
      getSettings(),
      getStorageUsageByUserId(userId),
      getUsedFileQuota()
    ]);

    const userStorageQuota = await getEffectiveStorageSpaceQuotaByUserId(
      userId,
      settings.storageSpaceQuotaByUser
    );

    let userUsed = userStorage.usedStorage;
    let serverUsed = serverStorage;

    const tempFiles: TTempFile[] = [];

    for (const tempFileId of tempFileIds) {
      const tempFile = this.getTemporaryFile(tempFileId);

      // a repeated id was consumed by its first save in a one-by-one loop
      if (!tempFile || tempFiles.includes(tempFile)) {
        throw new Error('File not found');
      }

      if (tempFile.userId !== userId) {
        throw new Error("You don't have permission to access this file");
      }

      if (userStorageQuota > 0 && userUsed + tempFile.size > userStorageQuota) {
        throw new Error('User storage limit exceeded');
      }

      const overflows =
        settings.storageQuota > 0 &&
        serverUsed + tempFile.size > settings.storageQuota;
      const action = settings.storageOverflowAction;

      if (overflows && action === StorageOverflowAction.PREVENT_UPLOADS) {
        throw new Error('Server storage limit exceeded.');
      }

      if (overflows && action === StorageOverflowAction.DELETE_OLD_FILES) {
        const evicted = await getExceedingOldFiles(tempFile.size, serverUsed);

        await Promise.all(evicted.map((file) => removeFile(file.id)));

        // evicted files may be the user's own and free their quota too
        for (const file of evicted) {
          serverUsed -= file.size;
          if (file.userId === userId) userUsed -= file.size;
        }
      }

      userUsed += tempFile.size;
      serverUsed += tempFile.size;
      tempFiles.push(tempFile);
    }

    return tempFiles;
  };

  private getUniqueName = (originalName: string): string => {
    const extension = getNormalizedExtension(originalName);
    return `${randomUUIDv7()}${extension}`;
  };

  public async saveFile(tempFileId: string, userId: number): Promise<TFile> {
    const [file] = await this.saveFiles([tempFileId], userId);

    return file!;
  }

  public async saveFiles(
    tempFileIds: string[],
    userId: number
  ): Promise<TFile[]> {
    if (tempFileIds.length === 0) return [];

    const tempFiles = await this.resolveBatch(tempFileIds, userId);
    const rows: (typeof files.$inferInsert)[] = [];
    let saved: TFile[] = [];

    try {
      for (const tempFile of tempFiles) {
        const fileName = this.getUniqueName(tempFile.originalName);
        const destinationPath = path.join(PUBLIC_PATH, fileName);

        await moveFile(tempFile.path, destinationPath);
        await this.removeTemporaryFile(tempFile.id, true);

        rows.push({
          name: fileName,
          extension: tempFile.extension,
          md5: tempFile.md5,
          size: tempFile.size,
          originalName: tempFile.originalName,
          userId,
          mimeType: mime.lookup(destinationPath) || 'application/octet-stream',
          createdAt: Date.now()
        });
      }
    } finally {
      // one INSERT (one commit) for the lot; a failed move still records
      // the files moved before it, so the orphan sweep can reclaim them
      if (rows.length > 0) {
        saved = await db.insert(files).values(rows).returning();
      }
    }

    // RETURNING order is unspecified; ids follow VALUES order
    return saved.sort((a, b) => a.id - b.id);
  }
}

const fileManager = new FileManager();

export { fileManager };
