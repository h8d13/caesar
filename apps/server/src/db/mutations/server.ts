import type { TSettings } from '@caesar/shared';
import { settings } from '@caesar/shared/db/schema';
import { isNotNull } from 'drizzle-orm';
import { db } from '..';

const updateSettings = async (serverSettings: Partial<TSettings>) =>
  db
    .update(settings)
    .set(serverSettings)
    .where(isNotNull(settings.name))
    .returning()
    .get();

export { updateSettings };
