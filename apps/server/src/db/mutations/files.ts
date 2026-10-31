import type { TFile } from '@caesar/shared';
import { files } from '@caesar/shared/db/schema';
import { PUBLIC_PATH } from '@server/helpers/paths';
import { logger } from '@server/logger';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { db } from '..';
import { invalidateSettings } from '../queries/server';

const removeFile = async (fileId: number): Promise<TFile | undefined> => {
  // message_files rows go with it: file_id is ON DELETE CASCADE
  const removedFile = await db
    .delete(files)
    .where(eq(files.id, fileId))
    .returning()
    .get();

  if (removedFile) {
    // may have been the logo: cached settings embed its row, and the FK
    // just nulled settings.logoId
    invalidateSettings();

    try {
      const filePath = path.join(PUBLIC_PATH, removedFile.name);

      await fs.unlink(filePath);
    } catch (error) {
      logger.error('Error deleting file from disk:', error);
    }
  }

  return removedFile;
};

export { removeFile };
