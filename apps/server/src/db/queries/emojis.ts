import type { TJoinedEmoji } from '@caesar/shared';
import { emojis, files, users } from '@caesar/shared/db/schema';
import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { db } from '..';
import { prepared } from '../prepared';
import {
  fileJson,
  jsonObject,
  jsonRow,
  jsonRows,
  precompile
} from './json-sql';
import { publicUserBaseFields } from './user-fields';

// The uploader ships as its public base columns only (no avatar/banner),
// which is all the client reads for emoji and sound attribution.
const joinedEmojiJson = precompile(
  jsonObject({
    ...getTableColumns(emojis),
    file: fileJson(files),
    user: jsonObject(publicUserBaseFields)
  })
);

const joinedEmojisQuery = (where: SQL | undefined) =>
  prepared(() =>
    db
      .select({ emoji: sql`${joinedEmojiJson}` })
      .from(emojis)
      .innerJoin(files, eq(files.id, emojis.fileId))
      .innerJoin(users, eq(users.id, emojis.userId))
      .where(where)
  );

const allEmojisQuery = joinedEmojisQuery(undefined);
const emojiByIdQuery = joinedEmojisQuery(eq(emojis.id, sql.placeholder('id')));

const getEmojiById = async (id: number): Promise<TJoinedEmoji | undefined> =>
  jsonRow<TJoinedEmoji>(emojiByIdQuery(), { id });

const getEmojis = async (): Promise<TJoinedEmoji[]> =>
  jsonRows<TJoinedEmoji>(allEmojisQuery());

const emojiExists = async (name: string): Promise<boolean> => {
  const emoji = await db
    .select()
    .from(emojis)
    .where(eq(emojis.name, name))
    .limit(1)
    .get();

  return !!emoji;
};

const getUniqueEmojiName = async (baseName: string): Promise<string> => {
  const MAX_LENGTH = 24;
  let normalizedBase = baseName.toLowerCase().replace(/\s+/g, '_');

  if (normalizedBase.length > MAX_LENGTH - 3) {
    normalizedBase = normalizedBase.substring(0, MAX_LENGTH - 3);
  }

  let emojiName = normalizedBase.substring(0, MAX_LENGTH);
  let counter = 1;

  while (await emojiExists(emojiName)) {
    const suffix = `_${counter}`;
    const maxBaseLength = MAX_LENGTH - suffix.length;
    emojiName = `${normalizedBase.substring(0, maxBaseLength)}${suffix}`;
    counter++;
  }

  return emojiName;
};

const getEmojiFileIdByEmojiName = async (
  name: string
): Promise<number | null> => {
  const result = await db
    .select({
      fileId: emojis.fileId
    })
    .from(emojis)
    .where(eq(emojis.name, name))
    .get();

  return result ? result.fileId : null;
};

export {
  emojiExists,
  getEmojiById,
  getEmojiFileIdByEmojiName,
  getEmojis,
  getUniqueEmojiName
};
