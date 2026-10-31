import type { TSettings } from '@caesar/shared';
import { settings } from '@caesar/shared/db/schema';
import { isNotNull } from 'drizzle-orm';
import { db } from '..';
import { invalidateSettings } from '../queries/server';

const updateSettings = async (serverSettings: Partial<TSettings>) => {
  const updated = await db
    .update(settings)
    .set(serverSettings)
    .where(isNotNull(settings.name))
    .returning()
    .get();

  // only once committed: invalidating first lets a read in between cache
  // the old row again
  invalidateSettings();

  return updated;
};

export { updateSettings };
