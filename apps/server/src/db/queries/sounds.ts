import type { TJoinedSound } from '@caesar/shared';
import { files, sounds, users } from '@caesar/shared/db/schema';
import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { db } from '..';
import { fileJson, jsonObject, parseJson, precompile } from './json-sql';
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

const selectJoinedSounds = async (where?: SQL): Promise<TJoinedSound[]> => {
  const rows = await db.all<{ sound: string }>(
    sql`SELECT ${joinedSoundJson} AS sound FROM ${sounds}
      INNER JOIN ${files} ON ${files.id} = ${sounds.fileId}
      INNER JOIN ${users} ON ${users.id} = ${sounds.userId}
      ${where ? sql`WHERE ${where}` : sql``}`
  );

  return rows.map((row) => parseJson<TJoinedSound>(row.sound));
};

const getSoundById = async (id: number): Promise<TJoinedSound | undefined> => {
  const [sound] = await selectJoinedSounds(eq(sounds.id, id));

  return sound;
};

const getSounds = async (): Promise<TJoinedSound[]> => selectJoinedSounds();

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
