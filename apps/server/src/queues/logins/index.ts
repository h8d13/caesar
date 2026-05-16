import { db } from '@server/db';
import { logins } from '@server/db/schema';
import { hashIp } from '@server/helpers/hash-ip';
import { logger } from '@server/logger';
import type { TConnectionInfo } from '@server/types';
import Queue from 'queue';

const loginsQueue = new Queue({
  concurrency: 1,
  autostart: true,
  timeout: 3000
});

loginsQueue.autostart = true;

const enqueueLogin = (userId: number, info: TConnectionInfo | undefined) => {
  loginsQueue.push(async (callback) => {
    if (!info) {
      logger.warn('No connection info provided for login of user %d', userId);
      callback?.();
      return;
    }

    const { ip, ...rest } = info;

    await db
      .insert(logins)
      .values({
        userId,
        ip: hashIp(ip),
        ...rest,
        createdAt: Date.now()
      })
      .returning()
      .get();

    callback?.();
  });
};

export { enqueueLogin };
