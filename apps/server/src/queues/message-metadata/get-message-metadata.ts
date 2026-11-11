import { extractUrls, type TMessageMetadata } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { fetchLinkPreview } from './fetch-preview';

// Bounded: a member picks the keys. Cleared wholesale every two hours, so
// a preview is at most that stale.
const MAX_CACHE_ENTRIES = 500;
const MAX_URLS_PER_MESSAGE = 5;

const metadataCache = new Map<string, TMessageMetadata>();

setInterval(() => metadataCache.clear(), 1000 * 60 * 60 * 2).unref();

const urlMetadataParser = async (
  content: string
): Promise<TMessageMetadata[]> => {
  const urls = extractUrls(content).slice(0, MAX_URLS_PER_MESSAGE);

  // per URL: one link that cannot be fetched must not cost the message its
  // other previews
  const results = await Promise.all(
    urls.map(async (url) => {
      const cached = metadataCache.get(url);

      if (cached) return cached;

      try {
        const metadata = await fetchLinkPreview(url);

        if (metadata) {
          // full: drop the oldest entry rather than stop caching
          if (metadataCache.size >= MAX_CACHE_ENTRIES) {
            metadataCache.delete(metadataCache.keys().next().value!);
          }

          metadataCache.set(url, metadata);
        }

        return metadata;
      } catch {
        // unreachable, too slow, refused: no preview
      }
    })
  );

  return results.filter((metadata) => metadata !== undefined);
};

export const processMessageMetadata = async (
  content: string,
  messageId: number
) => {
  const metadata = await urlMetadataParser(content);

  // Without previews only a row that still holds old ones (an edit that
  // dropped its links) needs the write. Every plain send used to rewrite
  // its row here, and the caller re-broadcast the whole message to every
  // viewer of the channel.
  const target =
    metadata.length > 0
      ? eq(messages.id, messageId)
      : and(eq(messages.id, messageId), isNotNull(messages.metadata));

  return await db
    .update(messages)
    .set({
      metadata,
      updatedAt: Date.now()
    })
    .where(target)
    .returning()
    .get();
};
