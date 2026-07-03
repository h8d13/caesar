import { extractUrls, type TMessageMetadata } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import dns from 'dns';
import { eq } from 'drizzle-orm';
import { getLinkPreview } from 'link-preview-js';
import { isFetchableUrl, isPrivateIP } from './url-guard';

type LinkPreviewResult = Awaited<ReturnType<typeof getLinkPreview>>;
const metadataCache = new Map<string, LinkPreviewResult>();

setInterval(
  () => metadataCache.clear(),
  1000 * 60 * 60 * 2 // clear cache every 2 hours
);

const urlMetadataParser = async (
  content: string
): Promise<TMessageMetadata[]> => {
  try {
    const urls = extractUrls(content);

    if (!urls) return [];

    const promises = urls.map(async (url) => {
      if (metadataCache.has(url)) return metadataCache.get(url);

      if (!isFetchableUrl(url)) {
        return;
      }

      const metadata = await getLinkPreview(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; bot)'
        },
        // 'follow' lets node-fetch chase redirects internally, and the
        // library only re-validates hosts on 'manual'. So an allowed URL
        // that 302s to 127.0.0.1 / 169.254.169.254 would be fetched
        // unchecked. 'manual' + handleRedirects re-runs the host guard (and
        // resolveDNSHost below) on the redirect target before following it.
        followRedirects: 'manual',
        handleRedirects: (_baseUrl: string, forwardedUrl: string) =>
          isFetchableUrl(forwardedUrl),
        resolveDNSHost: async (url: string) => {
          return new Promise((resolve, reject) => {
            try {
              const hostname = new URL(url).hostname;

              dns.lookup(hostname, { all: true }, (err, addresses) => {
                if (err) {
                  reject(err);
                  return;
                }

                for (const entry of addresses) {
                  if (isPrivateIP(entry.address)) {
                    reject(new Error('Cannot resolve private IP addresses'));
                    return;
                  }
                }

                const firstAddress = addresses[0]?.address;

                if (!firstAddress) {
                  reject(new Error('No addresses found'));
                  return;
                }

                resolve(firstAddress);
              });
            } catch (error) {
              reject(error);
            }
          });
        }
      });

      if (!metadata) return;

      metadataCache.set(url, metadata);

      return metadata;
    });

    const metadata = (await Promise.all(promises)) as TMessageMetadata[]; // TODO: fix these types

    return metadata ?? [];
  } catch {
    // ignore
  }

  return [];
};

export const processMessageMetadata = async (
  content: string,
  messageId: number
) => {
  const metadata = await urlMetadataParser(content);

  return await db
    .update(messages)
    .set({
      metadata,
      updatedAt: Date.now()
    })
    .where(eq(messages.id, messageId))
    .returning()
    .get();
};
