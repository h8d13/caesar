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
import { and, asc, eq, exists, lt, notExists, sql, sum } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { db } from '..';
import { prepared } from '../prepared';
import { getSettings } from './server';

// currentTotalSize comes from the caller: a batch save counts its files
// ahead of this one, which are not in the table yet
const getExceedingOldFiles = async (
  newFileSize: number,
  currentTotalSize: number
) => {
  const { storageQuota, storageUploadMaxFileSize } = await getSettings();

  if (newFileSize > storageUploadMaxFileSize) {
    throw new Error('File size exceeds the maximum allowed file size');
  }

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
    // only message attachments are fair game: avatars, banners, emojis,
    // sounds, status images and the logo must never be evicted for space
    .where(
      exists(
        db
          .select({ one: sql`1` })
          .from(messageFiles)
          .where(eq(messageFiles.fileId, files.id))
      )
    )
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

const fileChannelQuery = prepared(() =>
  db
    .select({
      private: channels.private,
      fileAccessToken: channels.fileAccessToken
    })
    .from(messageFiles)
    .innerJoin(messages, eq(messages.id, messageFiles.messageId))
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .where(eq(messageFiles.fileId, sql.placeholder('fileId')))
);

// channel of the message a file is attached to; undefined when the file is
// not a message attachment (avatar, emoji, logo, ...)
const getFileChannel = (fileId: number) => fileChannelQuery().get({ fileId });

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

// minAgeMs skips files saved moments ago: routes save the file row first and
// link it right after, so a sweep in between would delete a file in use.
const getOrphanedFileIds = async ({ minAgeMs = 0 } = {}): Promise<number[]> => {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        isUnreferenced(files.id),
        lt(files.createdAt, Date.now() - minAgeMs + 1)
      )
    );

  return rows.map(({ id }) => id);
};

// every non-attachment file GET (avatars, emojis, sounds) runs it
const orphanQuery = prepared(() =>
  db
    .select({ id: files.id })
    .from(files)
    .where(
      and(eq(files.id, sql.placeholder('fileId')), isUnreferenced(files.id))
    )
);

const isFileOrphaned = async (fileId: number): Promise<boolean> =>
  (await orphanQuery().get({ fileId })) !== undefined;

export {
  FILE_REFERENCES,
  getExceedingOldFiles,
  getFileChannel,
  getFilesByMessageId,
  getFilesByUserId,
  getOrphanedFileIds,
  getUsedFileQuota,
  isFileOrphaned
};
