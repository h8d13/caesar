import Queue from 'queue';
import { db } from '../../db';
import { logins } from '../../db/schema';
import { hashIp } from '../../helpers/hash-ip';
import { logger } from '../../logger';
import type { TConnectionInfo } from '../../types';

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
