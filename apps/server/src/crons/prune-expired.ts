import { messages } from '@caesar/shared/db/schema';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db';
import { publishMessage } from '../db/publishers';
import { logger } from '../logger';

const pruneExpiredMessages = async () => {
  const now = Date.now();

  const expired = await db
    .select({ id: messages.id, channelId: messages.channelId })
    .from(messages)
    .where(and(isNotNull(messages.expiresAt), lte(messages.expiresAt, now)));

  if (expired.length === 0) return;

  logger.info(`[Cron] Pruning ${expired.length} expired messages...`);

  for (const m of expired) {
    await db.delete(messages).where(eq(messages.id, m.id));
    publishMessage(m.id, m.channelId, 'delete');
  }
};

export { pruneExpiredMessages };
