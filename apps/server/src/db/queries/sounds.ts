import type { TJoinedSound } from '@caesar/shared';
import { files, sounds, users } from '@caesar/shared/db/schema';
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
const joinedSoundJson = precompile(
  jsonObject({
    ...getTableColumns(sounds),
    file: fileJson(files),
    user: jsonObject(publicUserBaseFields)
  })
);

const joinedSoundsQuery = (where: SQL | undefined) =>
  prepared(() =>
    db
      .select({ sound: sql`${joinedSoundJson}` })
      .from(sounds)
      .innerJoin(files, eq(files.id, sounds.fileId))
      .innerJoin(users, eq(users.id, sounds.userId))
      .where(where)
  );

const allSoundsQuery = joinedSoundsQuery(undefined);
const soundByIdQuery = joinedSoundsQuery(eq(sounds.id, sql.placeholder('id')));

const getSoundById = async (id: number): Promise<TJoinedSound | undefined> =>
  jsonRow<TJoinedSound>(soundByIdQuery(), { id });

const getSounds = async (): Promise<TJoinedSound[]> =>
  jsonRows<TJoinedSound>(allSoundsQuery());

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
