import { ServerEvents } from '@caesar/shared';
import { logins } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { hashIp } from '@server/helpers/hash-ip';
import { logger } from '@server/logger';
import type { TConnectionInfo } from '@server/types';
import { pubsub } from '@server/utils/pubsub';
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

    // Tell the user's own tab(s) to refresh the Recent sessions list.
    pubsub.publishFor(userId, ServerEvents.USER_LOGIN_RECORDED, {});

    callback?.();
  });
};

export { enqueueLogin };
