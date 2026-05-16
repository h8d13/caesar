import type { TJoinedEmoji } from '@caesar/shared';
import { eq } from 'drizzle-orm';
import { db } from '..';
import { emojis, files, users } from '../schema';
import { publicUserBaseFields } from './user-fields';

const emojiSelectFields = {
  emoji: emojis,
  file: files,
  user: publicUserBaseFields
};

// row shape from select(emojiSelectFields). user lacks avatar/banner/socialCredit
// that TPublicUser nominally requires; the wire shape mirrors this and callers
// only touch the columns we actually project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseEmoji = (row: any): TJoinedEmoji => ({
  ...row.emoji,
  file: row.file,
  user: row.user
});

const getEmojiById = async (id: number): Promise<TJoinedEmoji | undefined> => {
  const row = await db
    .select(emojiSelectFields)
    .from(emojis)
    .innerJoin(files, eq(emojis.fileId, files.id))
    .innerJoin(users, eq(emojis.userId, users.id))
    .where(eq(emojis.id, id))
    .limit(1)
    .get();

  if (!row) return undefined;

  return parseEmoji(row);
};

const getEmojis = async (): Promise<TJoinedEmoji[]> => {
  const rows = await db
    .select(emojiSelectFields)
    .from(emojis)
    .innerJoin(files, eq(emojis.fileId, files.id))
    .innerJoin(users, eq(emojis.userId, users.id));

  return rows.map(parseEmoji);
};

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
