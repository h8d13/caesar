type TEmojiItem = {
    name: string;
    shortcodes: string[];
    fallbackImage?: string;
    emoji?: string;
};

// text-presentation emoji render inconsistently across platforms
const isTextPresentation = (emoji: string): boolean => {
    const cp = emoji.codePointAt(0);

    if (cp === undefined || String.fromCodePoint(cp) !== emoji) return false;

    return (
        cp <= 0x00ae ||
        (cp >= 0x2000 && cp <= 0x2bff) ||
        (cp >= 0x3000 && cp <= 0x33ff)
    );
};

// checks if the emoji should use the fallback image (if available) instead of the native emoji character
const shouldUseFallbackImage = (emoji: TEmojiItem): boolean =>
    !!emoji.fallbackImage && (!emoji.emoji || isTextPresentation(emoji.emoji));

export { isTextPresentation, shouldUseFallbackImage, type TEmojiItem };
