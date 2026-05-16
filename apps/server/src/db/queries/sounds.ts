import type { TJoinedSound } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { db } from '..';
import { files, sounds, users } from '../schema';
import { publicUserBaseFields } from './user-fields';

const soundSelectFields = {
  sound: sounds,
  file: files,
  user: publicUserBaseFields
};

// row shape from select(soundSelectFields). user lacks avatar/banner/socialCredit
// that TPublicUser nominally requires; the wire shape mirrors this and callers
// only touch the columns we actually project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseSound = (row: any): TJoinedSound => ({
  ...row.sound,
  file: row.file,
  user: row.user
});

const getSoundById = async (id: number): Promise<TJoinedSound | undefined> => {
  const row = await db
    .select(soundSelectFields)
    .from(sounds)
    .innerJoin(files, eq(sounds.fileId, files.id))
    .innerJoin(users, eq(sounds.userId, users.id))
    .where(eq(sounds.id, id))
    .limit(1)
    .get();

  if (!row) return undefined;

  return parseSound(row);
};

const getSounds = async (): Promise<TJoinedSound[]> => {
  const rows = await db
    .select(soundSelectFields)
    .from(sounds)
    .innerJoin(files, eq(sounds.fileId, files.id))
    .innerJoin(users, eq(sounds.userId, users.id));

  return rows.map(parseSound);
};

const soundExists = async (name: string): Promise<boolean> => {
  const sound = await db
    .select()
    .from(sounds)
    .where(eq(sounds.name, name))
    .limit(1)
    .get();

  return !!sound;
};

const getUniqueSoundName = async (baseName: string): Promise<string> => {
  const MAX_LENGTH = 24;
  let normalizedBase = baseName.toLowerCase().replace(/\s+/g, '_');

  if (normalizedBase.length > MAX_LENGTH - 3) {
    normalizedBase = normalizedBase.substring(0, MAX_LENGTH - 3);
  }

  let soundName = normalizedBase.substring(0, MAX_LENGTH);
  let counter = 1;

  while (await soundExists(soundName)) {
    const suffix = `_${counter}`;
    const maxBaseLength = MAX_LENGTH - suffix.length;
    soundName = `${normalizedBase.substring(0, maxBaseLength)}${suffix}`;
    counter++;
  }

  return soundName;
};

export { getSoundById, getSounds, getUniqueSoundName, soundExists };
