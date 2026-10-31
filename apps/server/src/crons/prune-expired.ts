import { messages } from '@caesar/shared/db/schema';
import { and, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db';
import { publishMessage } from '../db/publishers';
import { logger } from '../logger';

const pruneExpiredMessages = async () => {
  const expired = await db
    .delete(messages)
    .where(
      and(isNotNull(messages.expiresAt), lte(messages.expiresAt, Date.now()))
    )
    .returning({ id: messages.id, channelId: messages.channelId });

  if (expired.length === 0) return;

  logger.info(`[Cron] Pruned ${expired.length} expired messages.`);

  for (const m of expired) {
    void publishMessage(m.id, m.channelId, 'delete');
  }
};

export { pruneExpiredMessages };
