import type { TFile } from '@caesar/shared';
import {
  channels,
  emojis,
  files,
  messageFiles,
  messageReactions,
  messages,
  settings,
  sounds,
  statusImages,
  users
} from '@caesar/shared/db/schema';
import { generateFileToken } from '@server/helpers/files-crypto';
import { and, asc, eq, notExists, sql, sum } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { db } from '..';
import { getSettings } from './server';

const getExceedingOldFiles = async (newFileSize: number) => {
  const { storageQuota, storageUploadMaxFileSize } = await getSettings();

  if (newFileSize > storageUploadMaxFileSize) {
    throw new Error('File size exceeds the maximum allowed file size');
  }

  const currentUsage = await db
    .select({
      totalSize: sum(files.size)
    })
    .from(files)
    .get();

  const currentTotalSize = Number(currentUsage?.totalSize ?? 0);
  const wouldExceedBy = currentTotalSize + newFileSize - storageQuota;

  if (wouldExceedBy <= 0) {
    return [];
  }

  const oldFiles = await db
    .select({
      id: files.id,
      name: files.name,
      size: files.size,
      userId: files.userId,
      createdAt: files.createdAt
    })
    .from(files)
    .orderBy(asc(files.createdAt));

  const filesToDelete = [];
  let freedSpace = 0;

  for (const file of oldFiles) {
    filesToDelete.push(file);
    freedSpace += file.size;

    if (freedSpace >= wouldExceedBy) {
      break;
    }
  }

  return filesToDelete;
};

const getFilesByMessageId = async (messageId: number): Promise<TFile[]> => {
  const rows = await db
    .select()
    .from(messageFiles)
    .innerJoin(files, eq(messageFiles.fileId, files.id))
    .where(eq(messageFiles.messageId, messageId))
    .all();
  return rows.map((row) => row.files);
};

const getFilesByUserId = async (userId: number): Promise<TFile[]> => {
  const result = await db
    .select({
      file: files,
      channel: channels
    })
    .from(files)
    .leftJoin(messageFiles, eq(files.id, messageFiles.fileId))
    .leftJoin(messages, eq(messageFiles.messageId, messages.id))
    .leftJoin(channels, eq(messages.channelId, channels.id))
    .where(eq(files.userId, userId))
    .all();

  const results = result.map((r) => {
    const rowCopy: TFile = { ...r.file };

    if (r.channel?.private) {
      rowCopy._accessToken = generateFileToken(
        r.file.id,
        r.channel.fileAccessToken
      );
    }

    return rowCopy;
  });

  return results;
};

const getUsedFileQuota = async (): Promise<number> => {
  const result = await db
    .select({
      usedSpace: sum(files.size)
    })
    .from(files)
    .get();

  return Number(result?.usedSpace ?? 0);
};

// Every column that keeps a file alive. Both orphan checks build from this
// one list: a referencing column missing here gets its files deleted by the
// cleanup cron. The schema drift test fails when a new FK to files is not
// listed.
const FILE_REFERENCES = [
  messageFiles.fileId,
  users.avatarId,
  users.bannerId,
  emojis.fileId,
  messageReactions.fileId,
  settings.logoId,
  sounds.fileId,
  statusImages.fileId
];

const isUnreferenced = (fileId: SQLiteColumn) =>
  and(
    ...FILE_REFERENCES.map((column) =>
      notExists(
        db
          .select({ one: sql`1` })
          .from(column.table)
          .where(eq(column, fileId))
      )
    )
  );

const getOrphanedFileIds = async (): Promise<number[]> => {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(isUnreferenced(files.id));

  return rows.map(({ id }) => id);
};

const isFileOrphaned = async (fileId: number): Promise<boolean> => {
  const row = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, fileId), isUnreferenced(files.id)))
    .get();

  return row !== undefined;
};

export {
  FILE_REFERENCES,
  getExceedingOldFiles,
  getFilesByMessageId,
  getFilesByUserId,
  getOrphanedFileIds,
  getUsedFileQuota,
  isFileOrphaned
};
