import LinkifyIt from 'linkify-it';

const linkify = new LinkifyIt();

const extractUrls = (content: string): string[] => {
  try {
    // strip HTML tags so we only scan visible text. avoids matching
    // attribute URLs like <img src="..."> from custom emojis / inline images.
    const text = content.replace(/<[^>]+>/g, ' ');
    const matches = linkify.match(text);

    const urls = matches ? matches.map((m) => m.url) : [];

    // remove duplicates
    return Array.from(new Set(urls));
  } catch {
    // ignore
  }

  return [];
};

export { extractUrls };
